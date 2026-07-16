import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, contasPagarTable, pagamentosTable } from "@workspace/db";
import {
  criarFixture,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Onda 3 — o caixa realizado. Até aqui `pagamentos` era write-only: gravado no
 * POST …/pagar e nunca lido de volta. Estes testes cobrem a leitura (com
 * filtros), a saída multi-conta, o estorno e a remoção de conta.
 */
describe("Lote 15 — caixa realizado (GET pagamentos, multi-conta, estorno)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    // O perfil da vendedora não tem o módulo financeiro (gate coberto no lote 7).
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function criarConta(descricao: string, valorPrevisto: number, colaboradorId?: string) {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({
        tipo: colaboradorId ? "SALARIO" : "DESPESA",
        descricao,
        valorPrevisto,
        vencimento: dataFutura(5).toISOString(),
        ...(colaboradorId ? { colaboradorId } : {}),
      })
      .expect(201);
    return res.body;
  }

  it("GET /financeiro/pagamentos devolve a saída com colaborador e contas quitadas", async () => {
    const conta = await criarConta("Aluguel jul", 3500);
    await agent
      .post(`/api/lojas/${f.lojaId}/contas-pagar/${conta.id}/pagar`)
      .send({ data: dataFutura(1).toISOString(), valorPago: 3500, forma: "PIX" })
      .expect(200);

    const lista = await agent.get(`/api/lojas/${f.lojaId}/financeiro/pagamentos`).expect(200);
    const pago = lista.body.find((p: any) => p.itens.some((i: any) => i.contaPagarId === conta.id));
    expect(pago.valorPago).toBe(3500);
    expect(pago.forma).toBe("PIX");
    expect(pago.itens[0].contaPagar.descricao).toBe("Aluguel jul");
  });

  it("uma saída quita N contas e o rateio vai para pagamento_itens", async () => {
    const luz = await criarConta("Luz", 400);
    const agua = await criarConta("Água", 150);

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [luz.id, agua.id], forma: "BOLETO" })
      .expect(201);

    // Sem valorPago no body, a saída vale a soma das contas.
    expect(criado.body.valorPago).toBe(550);
    expect(criado.body.itens).toHaveLength(2);
    const rateio = Object.fromEntries(
      criado.body.itens.map((i: any) => [i.contaPagar.descricao, i.valor]),
    );
    expect(rateio).toEqual({ Luz: 400, Água: 150 });

    for (const id of [luz.id, agua.id]) {
      const [conta] = await db.select().from(contasPagarTable).where(eq(contasPagarTable.id, id));
      expect(conta.status).toBe("PAGA");
    }
  });

  it("com desconto, o rateio dos itens fecha exatamente com o valor da saída", async () => {
    const a = await criarConta("Desconto A", 400);
    const b = await criarConta("Desconto B", 150);
    // Quita R$ 550 de dívida pagando R$ 500 (desconto de 50): o que o fluxo lê
    // como saída e o que o DRE soma por item têm que ser o mesmo número.
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [a.id, b.id], valorPago: 500 })
      .expect(201);

    const soma = criado.body.itens.reduce((s: number, i: any) => s + i.valor, 0);
    expect(soma).toBeCloseTo(500, 2);
    expect(criado.body.valorPago).toBe(500);
  });

  it("rateio com dízima não perde nem inventa centavo", async () => {
    // 3 contas de 100 quitadas por 100: 33,33 + 33,33 + 33,34 — a última absorve
    // o resto da divisão (mesma convenção do gerar-plano).
    const contas = [];
    for (const n of ["Terco A", "Terco B", "Terco C"]) contas.push(await criarConta(n, 100));
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: contas.map((c) => c.id), valorPago: 100 })
      .expect(201);

    const centavos = criado.body.itens.map((i: any) => Math.round(i.valor * 100));
    expect(centavos.reduce((s: number, v: number) => s + v, 0)).toBe(10_000);
  });

  it("saída multi-conta só carrega colaborador quando todas as contas são da mesma pessoa", async () => {
    const salario = await criarConta("Salário Ana", 2000, f.vendedoraId);
    const vale = await criarConta("Vale Ana", 300, f.vendedoraId);
    const mesmaPessoa = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [salario.id, vale.id] })
      .expect(201);
    expect(mesmaPessoa.body.colaboradorId).toBe(f.vendedoraId);
    expect(mesmaPessoa.body.colaborador.nome).toContain("Vendedora");

    // Misturar pessoas (aqui: uma pessoa + uma despesa sem dono) não pertence a ninguém.
    const outroSalario = await criarConta("Salário Bia", 1800, f.vendedoraId);
    const despesa = await criarConta("Material", 90);
    const misto = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [outroSalario.id, despesa.id] })
      .expect(201);
    expect(misto.body.colaboradorId).toBeNull();
  });

  it("filtra por intervalo de dias locais (inclusivo nas duas pontas) e por colaborador", async () => {
    const naJanela = await criarConta("Dentro", 100);
    const foraDaJanela = await criarConta("Fora", 100);
    // 2027-03-10T23:00-03:00 ainda é dia 10 local, mas já é 11 em UTC: se o
    // filtro truncasse o timestamptz em UTC, este pagamento escaparia da janela.
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: new Date("2027-03-10T23:00:00-03:00").toISOString(), contaIds: [naJanela.id] })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: new Date("2027-03-12T12:00:00-03:00").toISOString(), contaIds: [foraDaJanela.id] })
      .expect(201);

    const janela = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/pagamentos?de=2027-03-10&ate=2027-03-10`)
      .expect(200);
    const descricoes = janela.body.flatMap((p: any) => p.itens.map((i: any) => i.contaPagar.descricao));
    expect(descricoes).toContain("Dentro");
    expect(descricoes).not.toContain("Fora");

    const salario = await criarConta("Salário filtrado", 1000, f.vendedoraId);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(2).toISOString(), contaIds: [salario.id] })
      .expect(201);
    const doColaborador = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/pagamentos?colaboradorId=${f.vendedoraId}`)
      .expect(200);
    expect(doColaborador.body.length).toBeGreaterThan(0);
    expect(doColaborador.body.every((p: any) => p.colaboradorId === f.vendedoraId)).toBe(true);
  });

  it("recusa intervalo invertido", async () => {
    await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/pagamentos?de=2027-05-10&ate=2027-05-01`)
      .expect(400);
  });

  it("recusa quitar conta já paga e não deixa rastro parcial", async () => {
    const conta = await criarConta("Internet", 200);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [conta.id] })
      .expect(201);

    const outra = await criarConta("Telefone", 80);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [outra.id, conta.id] })
      .expect(409);

    // A conta boa do lote recusado continua em aberto — nada foi gravado.
    const [telefone] = await db.select().from(contasPagarTable).where(eq(contasPagarTable.id, outra.id));
    expect(telefone.status).toBe("PREVISTA");
  });

  it("recusa conta inexistente na loja", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: ["nao-existe"] })
      .expect(404);
  });

  it("estornar devolve as contas para PREVISTA e apaga a saída do caixa", async () => {
    const a = await criarConta("Estorno A", 120);
    const b = await criarConta("Estorno B", 80);
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [a.id, b.id] })
      .expect(201);

    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos/${criado.body.id}/estornar`)
      .expect(204);

    for (const id of [a.id, b.id]) {
      const [conta] = await db.select().from(contasPagarTable).where(eq(contasPagarTable.id, id));
      expect(conta.status).toBe("PREVISTA");
    }
    const restou = await db.select().from(pagamentosTable).where(eq(pagamentosTable.id, criado.body.id));
    expect(restou).toHaveLength(0);

    // Estornada, a conta pode ser paga de novo (o UNIQUE de pagamento_itens
    // cairia junto com o pagamento — senão a conta ficaria impagável).
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(2).toISOString(), contaIds: [a.id] })
      .expect(201);
  });

  it("DELETE conta só vale para PREVISTA; paga exige estorno antes", async () => {
    const previstaId = (await criarConta("Some", 50)).id;
    await agent.delete(`/api/lojas/${f.lojaId}/contas-pagar/${previstaId}`).expect(204);
    expect(await db.select().from(contasPagarTable).where(eq(contasPagarTable.id, previstaId))).toHaveLength(0);

    const paga = await criarConta("Fica", 60);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ data: dataFutura(1).toISOString(), contaIds: [paga.id] })
      .expect(201);
    await agent.delete(`/api/lojas/${f.lojaId}/contas-pagar/${paga.id}`).expect(409);

    await agent.delete(`/api/lojas/${f.lojaId}/contas-pagar/nao-existe`).expect(404);
  });
});
