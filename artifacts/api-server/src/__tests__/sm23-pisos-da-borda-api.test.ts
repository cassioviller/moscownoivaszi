import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-M23 — os pisos que faltavam na borda (rodada 2, ângulos 1 e 5).
 *
 * O padrão era sempre o mesmo: o criar tinha o piso e o editar não (ou o
 * contrário), e o Zod gerado do spec é a ÚNICA validação do servidor. Cada
 * caso abaixo era um 201/200 que gravava dado envenenado; agora é 400/422 na
 * borda, onde a S-M2 já tinha posto o piso das portas de pagamento.
 */
describe("S-M23 — a borda recusa o que nenhuma tela envia", () => {
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

  it("quantidade −1 no CRIAR de item: era R$ 200,00 nunca cobrados com cara de desconto", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Ajuste de barra", quantidade: -1, valorUnitario: 200 });
    expect(r.status).toBe(400);
    // valorUnitario negativo cai na mesma borda
    const r2 = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Ajuste", quantidade: 1, valorUnitario: -200 });
    expect(r2.status).toBe(400);
  });

  it("desconto PERCENTUAL 150 responde 422 — antes zerava o orçamento e o aceite assinava R$ 0,00", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "PERCENTUAL", descontoValor: 150 });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("DESCONTO_INVALIDO");
    // e o negativo morre no minimum do spec
    const r2 = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "PERCENTUAL", descontoValor: -10 });
    expect(r2.status).toBe(400);
  });

  it("conta a pagar de −R$ 3.200,00: era 201 e a saída negativa AUMENTAVA o caixa projetado", async () => {
    const r = await agent.post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`).send({
      tipo: "DESPESA",
      descricao: "conta envenenada",
      valorPrevisto: -3200,
      vencimento: dataFutura(10).toISOString(),
    });
    expect(r.status).toBe(400);
  });

  it("recorrência de valor −R$ 2.000,00: era a despesa que INFLAVA o caixa todo mês", async () => {
    const r = await agent.post(`/api/lojas/${f.lojaId}/financeiro/recorrencias`).send({
      tipo: "DESPESA",
      descricao: "aluguel às avessas",
      valor: -2000,
      diaVencimento: 5,
    });
    expect(r.status).toBe(400);
  });

  it("parcela de −R$ 1.000,00 no carnê do POST /contratos: a soma batia e nascia a parcela impagável", async () => {
    const lead = await criarLead(f);
    const r = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
      parcelas: [
        { numero: 1, valorPrevisto: 6000, vencimento: dataFutura(30).toISOString() },
        { numero: 2, valorPrevisto: -1000, vencimento: dataFutura(60).toISOString() },
      ],
    });
    expect(r.status).toBe(400);
  });

  it("PATCH de vestido com precoRealuguel −500 e nome vazio: era 200 gravando os dois", async () => {
    const vestido = await criarVestido(f);
    const negativo = await agent
      .patch(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}`)
      .send({ precoRealuguel: -500 });
    expect(negativo.status).toBe(400);

    const vazio = await agent
      .patch(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}`)
      .send({ nome: "", codigo: "" });
    expect(vazio.status).toBe(400);

    // O null EXPLÍCITO do E157 continua valendo: apagar o preço de segunda
    // saída é gesto legítimo, e o piso não pode tê-lo quebrado.
    await agent
      .patch(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}`)
      .send({ precoRealuguel: null })
      .expect(200);
  });
});
