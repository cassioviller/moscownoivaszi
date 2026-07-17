import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pagamentosTable } from "@workspace/db";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * Onda 5 — folha de pagamento pela API: geração idempotente, export CSV
 * (que SÓ LÊ) e a marcação de contabilidade num POST separado.
 */
describe("Lote 16 — folha de pagamento (API)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  const competencia = "2029-04";

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/salarios-recorrentes`)
      .send({ usuarioId: f.vendedoraId, valor: 3200, diaVencimento: 5 })
      .expect(201);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("gera a folha da competência a partir do salário recorrente ativo", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/folha`)
      .send({ competencia })
      .expect(200);

    expect(res.body.geradas).toBe(1);
    expect(res.body.contas[0]).toMatchObject({
      tipo: "SALARIO",
      colaboradorId: f.vendedoraId,
      competencia,
      descricao: `Salário ${competencia}`,
      valorPrevisto: 3200,
    });
    // Vencimento é data de NEGÓCIO (meio-dia SP): o dia UTC é o dia combinado.
    expect(res.body.contas[0].vencimento).toBe("2029-04-05T15:00:00.000Z");
  });

  it("rodar de novo gera 0 — reexecutar é seguro", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/folha`)
      .send({ competencia })
      .expect(200);
    expect(res.body).toEqual({ geradas: 0, contas: [] });

    // E a conta continua sendo UMA só (o que importa: ninguém foi pago 2x).
    const contas = await agent.get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`).expect(200);
    const doMes = contas.body.filter((c: any) => c.competencia === competencia);
    expect(doMes).toHaveLength(1);
  });

  it("competência inválida é 400", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/folha`)
      .send({ competencia: "2029-13" })
      .expect(400);
  });

  it("dois POSTs simultâneos NÃO pagam o salário duas vezes", async () => {
    // O bug: check-then-insert sem rede no banco. Dois cliques concorrentes
    // leem "nada feito" e ambos inserem. O índice único parcial impede.
    const comp = "2029-08";
    const [r1, r2] = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/financeiro/folha`).send({ competencia: comp }),
      agent.post(`/api/lojas/${f.lojaId}/financeiro/folha`).send({ competencia: comp }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    // Exatamente um dos dois gerou a conta; o outro reportou 0. Nunca os dois.
    const geradas = [r1.body.geradas, r2.body.geradas].sort();
    expect(geradas).toEqual([0, 1]);

    const contas = await agent.get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`).expect(200);
    expect(contas.body.filter((c: any) => c.competencia === comp)).toHaveLength(1);
  });

  it("colaborador com salário ativo não ganha um segundo — 409", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/salarios-recorrentes`)
      .send({ usuarioId: f.vendedoraId, valor: 4000, diaVencimento: 10 })
      .expect(409);
  });

  it("o export sai como CSV e o GET NÃO marca nada", async () => {
    // Paga a conta da folha para haver um item no extrato.
    const contas = await agent.get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`).expect(200);
    const conta = contas.body.find((c: any) => c.competencia === competencia);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: "2029-04-05T15:00:00.000Z", contaIds: [conta.id], forma: "PIX" })
      .expect(201);

    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/folha/exportar?de=2029-04-01&ate=2029-04-30`)
      .expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("contabilidade-2029-04-01-a-2029-04-30.csv");
    expect(res.text).toContain("Data,Colaborador,Descrição,Competência,Valor,Forma");
    // Dia lido no fuso da loja (o instante 15:00Z é 12:00 em SP, dia 05).
    expect(res.text).toContain(`05/04/2029,Vendedora Teste`);
    expect(res.text).toContain(`Salário ${competencia},${competencia},3200.00,PIX`);

    // O ponto da separação: baixar não é enviar.
    const [pg] = await db.select().from(pagamentosTable).where(eq(pagamentosTable.lojaId, f.lojaId));
    expect(pg.enviadoContabilidadeEm).toBeNull();
  });

  it("o POST de contabilidade marca, e remarcar não recarimba", async () => {
    const primeiro = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contabilidade/enviar`)
      .send({ de: "2029-04-01", ate: "2029-04-30" })
      .expect(200);
    expect(primeiro.body.marcados).toBe(1);

    const [pg] = await db.select().from(pagamentosTable).where(eq(pagamentosTable.lojaId, f.lojaId));
    expect(pg.enviadoContabilidadeEm).not.toBeNull();
    const carimbo = pg.enviadoContabilidadeEm;

    // Já marcado sai do alvo: a data do envio original é um fato, não um estado.
    const segundo = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contabilidade/enviar`)
      .send({ de: "2029-04-01", ate: "2029-04-30" })
      .expect(200);
    expect(segundo.body.marcados).toBe(0);

    const [depois] = await db.select().from(pagamentosTable).where(eq(pagamentosTable.lojaId, f.lojaId));
    expect(depois.enviadoContabilidadeEm).toEqual(carimbo);
  });

  it("intervalo invertido é 400 nas duas rotas", async () => {
    await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/folha/exportar?de=2029-04-30&ate=2029-04-01`)
      .expect(400);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contabilidade/enviar`)
      .send({ de: "2029-04-30", ate: "2029-04-01" })
      .expect(400);
  });

  it("salário inativo sai da folha do mês seguinte", async () => {
    const salarios = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/salarios-recorrentes`)
      .expect(200);
    await agent
      .patch(`/api/lojas/${f.lojaId}/financeiro/salarios-recorrentes/${salarios.body[0].id}`)
      .send({ ativo: false })
      .expect(200);

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/folha`)
      .send({ competencia: "2029-05" })
      .expect(200);
    expect(res.body.geradas).toBe(0);
  });

  it("o gate do módulo vale para as rotas novas", async () => {
    // A vendedora não tem o módulo financeiro no perfil da fixture.
    const semAcesso = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await semAcesso.post(`/api/lojas/${f.lojaId}/financeiro/folha`).send({ competencia }).expect(403);
    await semAcesso.get(`/api/lojas/${f.lojaId}/financeiro/folha/exportar`).expect(403);
  });
});
