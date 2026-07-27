import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, parcelasTable, avariasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { diaDeNegocio, hojeLocal, addDias } from "@workspace/financeiro-core";

/**
 * E97/F22+F23 — a avaria sabe que já foi cobrada, e não some enquanto sustenta
 * a cobrança.
 *
 * "Cobrar reparo" criava a parcela e não guardava vínculo. A tela não mudava de
 * estado, então dois cliques — o que acontece quando a rede demora e a pessoa
 * insiste — cobravam o mesmo conserto duas vezes no carnê da noiva. E a avaria,
 * cuja FOTO é a prova do dano, saía por um toque num ícone de 28px, com a
 * parcela sobrevivendo: a noiva ficava devendo por algo que o sistema não
 * conseguia mais mostrar.
 */
describe("E97 — avaria: cobrança única e prova preservada", () => {
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

  /** Uma avaria com custo, no bloqueio de uma noiva com contrato ATIVO. */
  async function avariaComCusto(custoReparo = 250) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-5),
    });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Barra rasgada", custoReparo })
      .expect(201);
    return { avaria: r.body as { id: string }, contrato, lead };
  }

  const parcelasDe = (contratoId: string) =>
    db.select().from(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));

  it("cobrar cria UMA parcela e grava o vínculo", async () => {
    const { avaria, contrato } = await avariaComCusto(250);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);

    expect(r.body.parcelaId).toBeTruthy();

    const parcelas = await parcelasDe(contrato.id);
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0].valorPrevisto).toBe(250);
    expect(parcelas[0].descricao).toContain("Barra rasgada");
    expect(parcelas[0].id).toBe(r.body.parcelaId);
  });

  it("a SEGUNDA cobrança é 409 — e não vira segunda parcela no carnê", async () => {
    const { avaria, contrato } = await avariaComCusto(300);
    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);

    const segunda = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(409);
    expect(segunda.body.error).toBe("AVARIA_JA_COBRADA");

    // O que realmente importa: o carnê da noiva.
    expect(await parcelasDe(contrato.id)).toHaveLength(1);
  });

  it("três cliques simultâneos criam UMA parcela — é o caso que o bug produzia", async () => {
    const { avaria, contrato } = await avariaComCusto(120);

    const respostas = await Promise.all(
      Array.from({ length: 3 }, () =>
        agent.post(`/api/lojas/${f.lojaId}/avarias/${avaria.id}/cobrar`).send({ contratoId: contrato.id }),
      ),
    );

    expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await parcelasDe(contrato.id)).toHaveLength(1);
  });

  it("o vencimento é dia de negócio — não o instante de agora", async () => {
    const { avaria, contrato } = await avariaComCusto(80);
    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);

    const [parcela] = await parcelasDe(contrato.id);
    expect(diaDeNegocio(parcela.vencimento)).toBe(addDias(hojeLocal(), 7));
  });

  it("avaria sem custo avaliado não vira cobrança", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 1000, fechadoEm: dataFutura(-5) });
    const semCusto = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Mancha a avaliar" })
      .expect(201);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${semCusto.body.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(422);
    expect(r.body.error).toBe("AVARIA_SEM_CUSTO");
    expect(await parcelasDe(contrato.id)).toHaveLength(0);
  });

  describe("F23 — a prova do dano não some enquanto a cobrança existe", () => {

  async function avariaCobrada() {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 5000, fechadoEm: dataFutura(-5) });
    const a = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Renda solta", custoReparo: 90 })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${a.body.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);
    return { avariaId: a.body.id as string, bloqueio, contrato };
  }

  it("remover avaria cobrada é 409, e a avaria continua lá", async () => {
    const { avariaId } = await avariaCobrada();

    const r = await agent.delete(`/api/lojas/${f.lojaId}/avarias/${avariaId}`).expect(409);
    expect(r.body.error).toBe("AVARIA_COM_COBRANCA");

    const [ainda] = await db.select().from(avariasTable).where(eq(avariasTable.id, avariaId));
    expect(ainda).toBeTruthy();
  });

  it("removida a parcela pelo caminho legítimo, a avaria volta a ser removível", async () => {
    const { avariaId, contrato } = await avariaCobrada();
    const [parcela] = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contrato.id));

    // ON DELETE SET NULL: perder o vínculo é recuperável, perder o registro do
    // dano não é — a avaria e a foto sobrevivem à remoção da parcela.
    await agent.delete(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}`).expect(204);

    const [semVinculo] = await db.select().from(avariasTable).where(eq(avariasTable.id, avariaId));
    expect(semVinculo.parcelaId).toBeNull();

    await agent.delete(`/api/lojas/${f.lojaId}/avarias/${avariaId}`).expect(204);
  });

  it("avaria NÃO cobrada continua removível", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const a = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Poeira na barra" })
      .expect(201);
    await agent.delete(`/api/lojas/${f.lojaId}/avarias/${a.body.id}`).expect(204);
  });
});
});
