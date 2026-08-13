import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, avariasTable, bloqueioVestidosTable, parcelasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Uma reserva, um contrato ativo — e a avaria que voltou a ter saída.
 *
 * **A reserva presa duas vezes.** A guarda S2/E107 só recusava o bloqueio que
 * JÁ tinha dona, e nenhuma rota escrevia `bloqueio.lead_id` — o campo nascia
 * nulo e continuava nulo (em 2026-07, 61 das 63 avarias do banco de
 * desenvolvimento viviam em bloqueio sem noiva; **S-C10, 13/08/2026: hoje são
 * ZERO avarias e 0 de 116 bloqueios sem dona em `moscow_base`** — o que este
 * arquivo prega é o VÍNCULO, que não depende de quantos nascem nulos). Então o
 * contrato da noiva A prendia o bloqueio B, e
 * o contrato da noiva C — com `dataCasamento` nulo, que pula a conferência de
 * data — prendia o MESMO B: a PK de `contrato_bloqueios` é
 * (contratoId, bloqueioId) e não impede o segundo par. O vestido ficava
 * prometido a duas noivas para a mesma data e a loja só descobria na retirada.
 *
 * **A avaria travada.** Cancelado o contrato, a parcela do reparo vira
 * CANCELADA e as três rotas passavam a se recusar mutuamente: `cobrar` dava 409
 * AVARIA_JA_COBRADA, `DELETE /parcelas/:id` dava 422, e `DELETE /avarias/:id`
 * dava 409 AVARIA_COM_COBRANCA. O reparo ficava impossível de cobrar e o
 * registro impossível de limpar.
 */
describe("Reserva presa por um contrato só, e avaria com saída", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma reserva SEM dona — o caso comum, e o que a guarda antiga não via. */
  async function reservaSemDona() {
    return criarBloqueio(f, {
      vestidoId: (await criarVestido(f)).id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
    });
  }

  function fecharContrato(leadId: string, bloqueioId: string, extras: Record<string, unknown> = {}) {
    return agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId,
      vendedoraId: f.vendedoraId,
      valorTotal: 8000,
      bloqueioVestidoIds: [bloqueioId],
      ...extras,
    });
  }

  it("o mesmo vestido NÃO pode ser prometido a duas noivas", async () => {
    const bloqueio = await reservaSemDona();
    const noivaA = await criarLead(f);
    const noivaC = await criarLead(f);

    await fecharContrato(noivaA.id, bloqueio.id, {
      dataCasamento: dataFutura(90).toISOString(),
    }).expect(201);

    // O segundo contrato vem SEM dataCasamento — o caminho que pulava a única
    // conferência restante e deixava passar. Agora ele para na guarda de noiva
    // do E107, que finalmente tem o que ler: o primeiro contrato deu dona à
    // reserva.
    const segundo = await fecharContrato(noivaC.id, bloqueio.id).expect(422);
    // E145/S-D12: o código deixou de ser o REFERENCIA_INVALIDA genérico — a
    // recusa de reserva com outra dona tem código próprio.
    expect(segundo.body.error).toBe("RESERVA_DE_OUTRA_NOIVA");
  });

  /**
   * E as reservas que JÁ estão no banco sem dona — presas por contrato ativo,
   * nascidas antes de a rota passar a escrever `lead_id`. Para elas a guarda de
   * noiva não tem o que comparar, e quem segura é o vínculo.
   */
  it("reserva sem dona presa por contrato ATIVO é recusada pelo VÍNCULO", async () => {
    const bloqueio = await reservaSemDona();
    const noivaA = await criarLead(f);
    const noivaC = await criarLead(f);
    await fecharContrato(noivaA.id, bloqueio.id).expect(201);

    // O estado legado: o vínculo existe, a dona não.
    await db
      .update(bloqueioVestidosTable)
      .set({ leadId: null })
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));

    const segundo = await fecharContrato(noivaC.id, bloqueio.id).expect(409);
    expect(segundo.body.error).toBe("RESERVA_JA_CONTRATADA");
  });

  it("o contrato DÁ DONO à reserva que não tinha — é o que a guarda de noiva lê", async () => {
    const bloqueio = await reservaSemDona();
    const noiva = await criarLead(f);
    expect(bloqueio.leadId).toBeNull();

    await fecharContrato(noiva.id, bloqueio.id).expect(201);

    const [depois] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(depois.leadId).toBe(noiva.id);
  });

  it("cancelado o contrato, a reserva volta ao mercado", async () => {
    const bloqueio = await reservaSemDona();
    const primeira = await criarLead(f);
    const criado = await fecharContrato(primeira.id, bloqueio.id).expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/cancelar`)
      .send({ motivo: "desistiu" })
      .expect(200);

    // O cancelamento soft-cancela o bloqueio; a loja abre uma reserva nova para
    // a próxima noiva, e nada do contrato morto a atrapalha.
    const outro = await reservaSemDona();
    const segunda = await criarLead(f);
    await fecharContrato(segunda.id, outro.id).expect(201);
  });

  it("reserva de OUTRA noiva continua recusada — agora com o código próprio do E145", async () => {
    const noivaA = await criarLead(f);
    const noivaB = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: (await criarVestido(f)).id,
      tipo: "RESERVA_CASAMENTO",
      leadId: noivaA.id,
      casamentoData: dataFutura(90),
    });
    const r = await fecharContrato(noivaB.id, bloqueio.id).expect(422);
    // E145/S-D12: era REFERENCIA_INVALIDA — o mesmo código que a tela traduz
    // como "Essa noiva não é desta loja.", sombreando o detalhe da reserva.
    expect(r.body.error).toBe("RESERVA_DE_OUTRA_NOIVA");
  });

  // ───────────────────────── a avaria ─────────────────────────

  /** Avaria cobrada num contrato ativo, e o contrato depois cancelado. */
  async function avariaComCobrancaMorta() {
    const noiva = await criarLead(f);
    const bloqueio = await reservaSemDona();
    const contrato = await fecharContrato(noiva.id, bloqueio.id).expect(201);

    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Mancha na barra", custoReparo: 350 })
      .expect(201);

    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
      .send({ contratoId: contrato.body.id })
      .expect(201);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.body.id}/cancelar`)
      .send({ motivo: "noiva desistiu" })
      .expect(200);

    return { noiva, avariaId: avaria.body.id as string };
  }

  it("cancelado o contrato, o mesmo reparo pode ser cobrado no contrato novo", async () => {
    const { noiva, avariaId } = await avariaComCobrancaMorta();

    // A noiva volta meses depois e assina outro contrato.
    const outroBloqueio = await reservaSemDona();
    const novo = await fecharContrato(noiva.id, outroBloqueio.id).expect(201);

    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avariaId}/cobrar`)
      .send({ contratoId: novo.body.id })
      .expect(201);

    const [depois] = await db.select().from(avariasTable).where(eq(avariasTable.id, avariaId));
    const [parcela] = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.id, depois.parcelaId!));
    expect(parcela.contratoId).toBe(novo.body.id);
    expect(parcela.status).not.toBe("CANCELADA");
  });

  it("e a avaria órfã pode ser apagada — a foto não sustenta mais nada", async () => {
    const { avariaId } = await avariaComCobrancaMorta();
    await agent.delete(`/api/lojas/${f.lojaId}/avarias/${avariaId}`).expect(204);
    const restantes = await db.select().from(avariasTable).where(eq(avariasTable.id, avariaId));
    expect(restantes).toHaveLength(0);
  });

  it("com a cobrança VIVA nada disso vale: 409 nos dois caminhos", async () => {
    const noiva = await criarLead(f);
    const bloqueio = await reservaSemDona();
    const contrato = await fecharContrato(noiva.id, bloqueio.id).expect(201);
    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Rasgo na alça", custoReparo: 120 })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
      .send({ contratoId: contrato.body.id })
      .expect(201);

    const recobrar = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
      .send({ contratoId: contrato.body.id })
      .expect(409);
    expect(recobrar.body.error).toBe("AVARIA_JA_COBRADA");

    const apagar = await agent
      .delete(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}`)
      .expect(409);
    expect(apagar.body.error).toBe("AVARIA_COM_COBRANCA");
  });
});
