import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, cabinesTable, atendimentosTable, ajustesTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarVestido,
  criarReserva,
  criarBloqueio,
  criarOrcamento,
  criarOrcamentoItem,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E185 — a reserva-mãe deixa de ser invisível.
 *
 * O E179 abriu `GET /reservas/:id` e ensinou as cinco portas de `reservas.ts`
 * a dizer `donoLeadId`. Ficaram de fora **10 operações** que serializam um
 * `BloqueioVestido` aninhado (S-O56) e a listagem de reservas, que devolvia a
 * loja INTEIRA sem recorte nenhum (S-O55).
 *
 * O véu é o caso: `bloqueio_vestidos.lead_id` é NULLABLE e `reservas.lead_id`
 * é NOT NULL, então a peça pendurada numa reserva-mãe **tem dona sem ter
 * `lead_id`**. Quem lia só o campo próprio via "sem dona" — e a porta que
 * DECIDE por isso é o `POST /contratos`, que adota a reserva sem dono.
 */
describe("E185 — de quem é o bloqueio, dito fora de reservas.ts, e a listagem que recorta", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let cabineId: string;
  let noivaA: string;
  let noivaB: string;
  let reservaDaB: string;
  /** O véu de B: pendurado na reserva-mãe dela, SEM `lead_id` próprio. */
  let veuDaB: string;
  let provaDoVeu: string;
  let ajusteDoVeu: string;
  const casamento = dataFutura(120);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine E185" });

    noivaA = (await criarLead(f)).id;
    noivaB = (await criarLead(f)).id;
    reservaDaB = (await criarReserva(f, { leadId: noivaB, casamentoData: casamento })).id;
    veuDaB = (
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: (await criarVestido(f)).id,
        leadId: null,
        reservaId: reservaDaB,
        casamentoData: casamento,
      })
    ).id;

    provaDoVeu = randomUUID();
    await db.insert(atendimentosTable).values({
      id: provaDoVeu,
      lojaId: f.lojaId,
      leadId: noivaB,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: veuDaB,
      inicio: dataFutura(30),
    });
    ajusteDoVeu = randomUUID();
    await db.insert(ajustesTable).values({
      id: ajusteDoVeu,
      lojaId: f.lojaId,
      atendimentoId: provaDoVeu,
      descricao: "Barra do véu",
    });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  // ────────────────── S-O56 — o dono fora de `reservas.ts` ──────────────────

  it("S-O56 — a agenda diz o dono do bloqueio da prova (5 portas, uma constante)", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?bloqueioId=${veuDaB}`)
      .expect(200);
    const prova = res.body.find((a: { id: string }) => a.id === provaDoVeu);
    expect(prova.bloqueio.leadId).toBeNull();
    expect(prova.bloqueio.donoLeadId).toBe(noivaB);
  });

  it("e o PATCH do atendimento devolve o mesmo dono que a listagem", async () => {
    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/atendimentos/${provaDoVeu}`)
      .send({ observacao: "confere o dono" })
      .expect(200);
    expect(res.body.bloqueio.donoLeadId).toBe(noivaB);
  });

  it("S-O56 — a fila da costureira também: ajuste → atendimento → bloqueio", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const ajuste = res.body.find((a: { id: string }) => a.id === ajusteDoVeu);
    expect(ajuste.atendimento.bloqueio.leadId).toBeNull();
    expect(ajuste.atendimento.bloqueio.donoLeadId).toBe(noivaB);
  });

  // ────────── S-O56 — e a porta que DECIDE pelo dono lê o mesmo campo ──────────

  it("S-O56 — as candidatas do orçamento não oferecem o véu de OUTRA noiva", async () => {
    const vestidoDoVeu = (
      await db.query.bloqueioVestidosTable.findFirst({ where: (b, { eq }) => eq(b.id, veuDaB) })
    )!.vestidoId;
    const orcamentoDeA = await criarOrcamento(f, { leadId: noivaA, status: "RASCUNHO" });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamentoDeA.id,
      tipo: "VESTIDO",
      vestidoId: vestidoDoVeu,
    });
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoDeA.id}/reservas-candidatas`)
      .expect(200);
    // "Sem dona" é `donoLeadId` nulo, não `lead_id` nulo: o véu de B tem dona.
    expect(res.body.map((c: { id: string }) => c.id)).not.toContain(veuDaB);
  });

  it("S-O56 — e o contrato de OUTRA noiva não adota o véu que já tem dona", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: noivaA,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoIds: [veuDaB],
      })
      .expect(422);
    expect(res.body.error).toBe("RESERVA_DE_OUTRA_NOIVA");
    // E a peça continua de B — a adoção gravava o nome de A por cima.
    const depois = await db.query.bloqueioVestidosTable.findFirst({
      where: (b, { eq }) => eq(b.id, veuDaB),
    });
    expect(depois!.leadId).toBeNull();
  });

  it("S-O56 — e a prova de OUTRA noiva não se marca sobre o véu que já tem dona", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: noivaA,
        cabineId,
        vendedoraId: f.vendedoraId,
        tipo: "PROVA",
        bloqueioId: veuDaB,
        inicio: dataFutura(35).toISOString(),
      })
      .expect(422);
    expect(res.body.error).toBe("RESERVA_DE_OUTRA_NOIVA");
  });

  it("a reserva SEM mãe nenhuma continua adotável — é o caso legítimo e comum", async () => {
    const solta = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: (await criarVestido(f)).id,
      leadId: null,
      casamentoData: casamento,
    });
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: noivaA,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        dataCasamento: casamento.toISOString(),
        bloqueioVestidoIds: [solta.id],
      })
      .expect(201);
    expect(res.body.leadId).toBe(noivaA);
    const depois = await db.query.bloqueioVestidosTable.findFirst({
      where: (b, { eq }) => eq(b.id, solta.id),
    });
    expect(depois!.leadId).toBe(noivaA);
  });

  // ───────────────── S-O55 — a listagem que devolvia a loja inteira ─────────────────

  it("S-O55 — ?leadId= recorta a listagem de reservas por noiva", async () => {
    await criarReserva(f, { leadId: noivaA, casamentoData: dataFutura(150) });
    const todas = await agent.get(`/api/lojas/${f.lojaId}/reservas`).expect(200);
    expect(todas.body.length).toBeGreaterThanOrEqual(2);

    const daB = await agent.get(`/api/lojas/${f.lojaId}/reservas?leadId=${noivaB}`).expect(200);
    expect(daB.body.map((r: { id: string }) => r.id)).toEqual([reservaDaB]);
  });

  /**
   * E240/S-O99 — o recorte `futuras` SAIU de `GET /reservas`. Ele nasceu aqui
   * no E185 e ficou três sessões com zero chamadores fora deste arquivo; a
   * pergunta futuro/passado é do livro de reservas, por PEÇA
   * (`GET /bloqueios?futuras=`, E87). O que se prega agora é que o parâmetro
   * é IGNORADO como qualquer chave desconhecida — a loja inteira vem, e a
   * reserva passada continua na lista, porque este é o agregado sem recorte
   * de tempo.
   */
  it("E240/S-O99 — ?futuras= não é mais recorte desta porta: a lista vem inteira", async () => {
    const passada = await criarReserva(f, { leadId: noivaA, casamentoData: dataFutura(-4000) });

    const comChaveMorta = await agent.get(`/api/lojas/${f.lojaId}/reservas?futuras=true`).expect(200);
    const ids = comChaveMorta.body.map((r: { id: string }) => r.id);
    expect(ids).toContain(reservaDaB);
    expect(ids).toContain(passada.id);
  });

  it("S-O55 — SEM recorte a loja inteira continua vindo", async () => {
    const todas = await agent.get(`/api/lojas/${f.lojaId}/reservas`).expect(200);
    expect(todas.body.map((r: { id: string }) => r.id)).toContain(reservaDaB);
  });
});
