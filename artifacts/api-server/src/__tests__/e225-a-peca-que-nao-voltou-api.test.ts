import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, bloqueioVestidosTable, contratoBloqueiosTable, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E225 — a peça que saiu e não voltou continua OCUPANDO quando o contrato
 * cai** (S-C110).
 *
 * `buscarBloqueiosAtivos` filtrava `cancelado_em IS NULL`, e a régua física só
 * roda sobre o que ele devolve: cancelar o contrato soft-cancela os bloqueios
 * (`POST /contratos/:id/cancelar`) e a peça voltava ao acervo **enquanto está
 * na casa da noiva** — outra noiva a reservava para a mesma data, e a dupla
 * promessa só aparecia na retirada. Classe da S-M7 e da S-M24, pelo caminho do
 * cancelamento de CONTRATO.
 *
 * O predicado novo é o da S-C85, aplicado à disponibilidade: **quem discrimina
 * é `retiradaDataReal`** — cancelar é gesto administrativo e não traz o
 * vestido de volta. Bloqueio cancelado com retirada real e sem devolução
 * continua ocupando (e só FISICAMENTE: a janela de PROVA de um contrato morto
 * não agenda nada); registrada a devolução, ele solta.
 *
 * População no `heliumdb` na abertura: **0 cancelados, 0 com retirada** — o
 * que estava aberto era o mecanismo, e o relógio começou a andar no E224, que
 * criou o gesto da retirada.
 */
describe("E225 — a peça que saiu e não voltou ocupa mesmo com o contrato cancelado", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /**
   * A cena da sobra: casamento há 10 dias, peça retirada há 12, devolução
   * nenhuma, bloqueio cancelado ontem. A janela física fica ABERTA
   * (`[retirada, null]`, motivo ATRASO_DEVOLUCAO) — é o motor do E49/E165 que
   * já existia; o que faltava era o filtro deixá-lo ver este bloqueio.
   */
  async function pecaNaRuaCancelada() {
    const noivaA = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: noivaA.id,
      casamentoData: diasReais(-10),
      retiradaDataReal: diasReais(-12),
      canceladoEm: diasReais(-1),
    });
    return { noivaA, vestido, bloqueio };
  }

  /**
   * Dias a partir de AGORA — `dataFutura` soma sobre a base FIXA de 2027, e a
   * cena do atraso precisa de passado REAL: o motivo ATRASO_DEVOLUCAO só nasce
   * quando hoje passa do fim previsto do uso. Foi o primeiro vermelho falso
   * deste arquivo: casamento em "dataFutura(-10)" é 2027-09-05, e a peça fora
   * aparecia como USO, corretamente.
   */
  const diasReais = (n: number) => new Date(Date.now() + n * 86_400_000);

  const reservarPara = (vestidoId: string, leadId: string, emDias: number) =>
    agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId,
      leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(emDias).toISOString(),
    });

  it("a noiva B leva 409 com o motivo certo — a peça está na casa da noiva A", async () => {
    const { vestido } = await pecaNaRuaCancelada();
    const noivaB = await criarLead(f);

    const r = await reservarPara(vestido.id, noivaB.id, 30);

    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.conflitos?.[0]?.motivo).toBe("ATRASO_DEVOLUCAO");
  });

  it("o calendário da loja mostra o conflito — a mesma leitura da tela de vestidos", async () => {
    const { vestido } = await pecaNaRuaCancelada();
    const dia = dataFutura(30).toISOString().slice(0, 10);

    const r = await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/disponibilidade`)
      .query({ data: dia })
      .expect(200);

    const item = (r.body.itens as { vestidoId: string; status: string }[]).find(
      (i) => i.vestidoId === vestido.id,
    );
    expect(item, "o vestido nem aparece na leitura batch").toBeDefined();
    expect(item!.status).not.toBe("DISPONIVEL");
  });

  it("registrada a devolução, a peça volta ao acervo — o predicado solta pelos dois lados", async () => {
    const { vestido, bloqueio } = await pecaNaRuaCancelada();
    const noivaB = await criarLead(f);

    // A devolução se registra no bloqueio CANCELADO — a porta não a recusa,
    // senão a peça devolvida de um contrato morto ocuparia para sempre.
    await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ devolucaoDataReal: new Date().toISOString() })
      .expect(200);

    const r = await reservarPara(vestido.id, noivaB.id, 30);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  });

  /**
   * **E245 (B5 da conferência) — a peça só SAI por bloqueio vivo.** O
   * `PATCH /bloqueios` escrevia `retiradaDataReal` sem repetir
   * `cancelado_em IS NULL`: o cancelamento em voo passava entre a leitura e a
   * escrita e o bloqueio ficava cancelado E "na rua" — o predicado do E225
   * então ocupava o vestido por uma peça que não está com ninguém. A
   * devolução e a lavagem continuam se registrando no cancelado (o `it` acima).
   */
  it("E245 — registrar a RETIRADA × cancelar em voo: a retirada perde (409) e a peça não fica \"na rua\" por reserva morta", async () => {
    const noivaA = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: noivaA.id,
      casamentoData: diasReais(3),
    });
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query(`UPDATE bloqueio_vestidos SET cancelado_em = now() WHERE id = $1`, [bloqueio.id]);
      const patchP = Promise.resolve(
        agent.patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`).send({ retiradaDataReal: new Date().toISOString() }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");
      const r = await patchP;
      // ANTES: 200 — bloqueio cancelado com retirada_data_real preenchida.
      expect(r.status, JSON.stringify(r.body)).toBe(409);
      expect(r.body.error).toBe("RESERVA_CANCELADA");
    } finally {
      await cliente.query("ROLLBACK").catch(() => {});
      cliente.release();
    }
    const [depois] = await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(depois!.retiradaDataReal).toBeNull();
    // E o vestido está LIVRE para outra noiva — nada "na rua".
    const noivaB = await criarLead(f);
    expect((await reservarPara(vestido.id, noivaB.id, 30)).status).toBe(201);
  });

  it("cancelado SEM retirada segue soltando na hora — o cancelamento comum não regride", async () => {
    const noivaA = await criarLead(f);
    const vestido = await criarVestido(f);
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: noivaA.id,
      casamentoData: dataFutura(30),
      canceladoEm: dataFutura(-1),
    });
    const noivaB = await criarLead(f);

    const r = await reservarPara(vestido.id, noivaB.id, 30);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  });

  it("a PROVA de um bloqueio cancelado não agenda nada — só a ocupação FÍSICA sobrevive ao cancelamento", async () => {
    // Peça na rua com casamento FUTURO (cancelou entre a retirada antecipada e
    // o casamento): a janela de prova prevista existiria, mas prova de contrato
    // morto não é compromisso. O que deve barrar a noiva B é a janela FÍSICA
    // aberta — e o motivo diz isso.
    const noivaA = await criarLead(f);
    const vestido = await criarVestido(f);
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: noivaA.id,
      casamentoData: diasReais(20),
      retiradaDataReal: diasReais(-2),
      canceladoEm: diasReais(-1),
    });
    const noivaB = await criarLead(f);

    const r = await reservarPara(vestido.id, noivaB.id, 60);
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    const motivos = (r.body.conflitos as { motivo: string }[]).map((c) => c.motivo);
    expect(motivos).not.toContain("PROVA");
  });

  it("o caminho INTEIRO: retirada real → contrato cancelado pela porta → a peça segue presa", async () => {
    // A mesma história pelo gesto de verdade, sem encenar o canceladoEm: o
    // POST /cancelar soft-cancela o bloqueio, e é essa escrita que a S-C110
    // acusava de soltar a peça.
    const noivaA = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamentoData = diasReais(-5);
    const reserva = await criarReserva(f, { leadId: noivaA.id, casamentoData, status: "CONFIRMADA" });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId: noivaA.id,
      reservaId: reserva.id,
      casamentoData,
      retiradaDataReal: diasReais(-7),
    });
    const contrato = await criarContrato(f, {
      leadId: noivaA.id,
      valorTotal: 3000,
      fechadoEm: diasReais(-20),
    });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "A noiva sumiu com o vestido", destinoPago: "manter" })
      .expect(200);

    // O cancelamento gravou — e mesmo assim a peça não volta ao acervo.
    const [b] = await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(b!.canceladoEm).not.toBeNull();

    const noivaB = await criarLead(f);
    const r = await reservarPara(vestido.id, noivaB.id, 45);
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect((r.body.conflitos as { motivo: string }[])[0]?.motivo).toBe("ATRASO_DEVOLUCAO");

    // Limpeza local: o contrato desta cena não é da fixture.
    await db.delete(contratoBloqueiosTable).where(eq(contratoBloqueiosTable.contratoId, contrato.id));
    await db.delete(contratosTable).where(eq(contratosTable.id, contrato.id));
  });
});
