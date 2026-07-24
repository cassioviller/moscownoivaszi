import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, contratosTable, comissaoRegrasTable, comissaoFaixasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { competenciaDe, competenciasAnteriores, limitesCompetencia } from "../lib/comissao";
import { criarFixture, criarLead, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E53 — a varredura das competências esquecidas pela API. O diff está provado
 * no unit; aqui interessa a LIGAÇÃO: que a pendência nasce de venda real, que
 * some quando o mês fecha, e que a competência corrente nunca entra.
 *
 * As vendas passadas entram por UPDATE do `fechadoEm` depois de criar o
 * contrato: o servidor carimba o instante (a autoridade é dele, e está certo),
 * então backdatar pela API não é possível — e sem venda passada não há
 * pendência a varrer.
 */
describe("Pendências de fechamento (E53)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const ATUAL = competenciaDe(new Date());
  const [ANTIGA, RECENTE] = competenciasAnteriores(ATUAL, 2);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    const regraId = randomUUID();
    await db.insert(comissaoRegrasTable).values({
      id: regraId,
      lojaId: f.lojaId,
      vendedoraId: f.superAdminId,
      vigenciaInicio: new Date("2020-01-01T12:00:00-03:00"),
      bonusAcumulaFaixas: false,
    });
    await db.insert(comissaoFaixasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      regraId,
      minAcumulado: 0,
      maxAcumulado: null,
      percentual: 5,
      bonusFixo: null,
    });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Contrato da loja com o `fechadoEm` posto na competência pedida. */
  async function venderEm(competencia: string, valorTotal: number): Promise<string> {
    const lead = await criarLead(f);
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.superAdminId, valorTotal })
      .expect(201);
    const { inicio } = limitesCompetencia(competencia);
    await db
      .update(contratosTable)
      .set({ fechadoEm: new Date(inicio.getTime() + 10 * 86_400_000) })
      .where(eq(contratosTable.id, res.body.id));
    return res.body.id;
  }

  const pendencias = () => agent.get(`/api/lojas/${f.lojaId}/comissao/pendencias`);

  it("loja sem venda passada não tem pendência", async () => {
    const res = await pendencias().expect(200);
    expect(res.body).toEqual([]);
  });

  it("venda em competência passada e não fechada vira pendência", async () => {
    await venderEm(ANTIGA, 4000);

    const res = await pendencias().expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      competencia: ANTIGA,
      vendedoras: 1,
      totalVendas: 4000,
    });
  });

  it("a venda do mês CORRENTE não vira pendência", async () => {
    // O mês corrente ainda pode receber vendas, e o próprio fechamento o
    // recusa — cobrá-lo seria pedir uma ação que a API nega.
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: (await criarLead(f)).id, vendedoraId: f.superAdminId, valorTotal: 9999 })
      .expect(201);

    const res = await pendencias().expect(200);
    expect(res.body.map((p: { competencia: string }) => p.competencia)).not.toContain(ATUAL);
  });

  it("duas competências pendentes saem da mais antiga para a mais recente", async () => {
    await venderEm(RECENTE, 7000);

    const res = await pendencias().expect(200);
    expect(res.body.map((p: { competencia: string }) => p.competencia)).toEqual([ANTIGA, RECENTE]);
  });

  it("fechar a competência tira a pendência da lista", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: ANTIGA })
      .expect(201);

    const res = await pendencias().expect(200);
    // A ação que resolve o alerta tem de apagá-lo; alerta que sobrevive à
    // própria solução ensina a ignorar o alerta.
    expect(res.body.map((p: { competencia: string }) => p.competencia)).toEqual([RECENTE]);
  });

  it("contrato cancelado sai da conta — não há o que comissionar", async () => {
    const soDoRecente = async () =>
      (await pendencias().expect(200)).body.find(
        (p: { competencia: string }) => p.competencia === RECENTE,
      );

    // RECENTE já tem 7.000 dos testes acima; a venda nova sobe o total.
    const antes = await soDoRecente();
    const contratoId = await venderEm(RECENTE, 5000);
    expect((await soDoRecente()).totalVendas).toBe(antes.totalVendas + 5000);

    // Cancelar devolve a base ao que era: a varredura só soma contrato ATIVO,
    // e cobrar o fechamento de uma venda que deixou de existir mandaria a
    // dona da loja pagar comissão sobre nada.
    await db.update(contratosTable).set({ status: "CANCELADO" }).where(eq(contratosTable.id, contratoId));
    expect((await soDoRecente()).totalVendas).toBe(antes.totalVendas);
  });
});
