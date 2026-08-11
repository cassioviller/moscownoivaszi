import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E169 — a tela do contrato e o dinheiro miúdo, do lado do servidor.
 *
 * Três das dez frentes do épico têm porta de API: o teto do desconto em VALOR
 * (A07.3), o carnê que se completa depois de perder uma parcela (P7) e o campo
 * vazio que passa a APAGAR (S-M10). As outras sete são decisão de tela e vivem
 * nas funções puras do frontend, com a varredura que cobra que a tela as chame.
 */
describe("E169 — o teto do desconto, o carnê que se completa e o campo que apaga", () => {
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
   * A07.3 — o S-M23 fechou a linha `:83` do clamp (PERCENTUAL) e deixou a
   * `:84` (VALOR) aberta. E a mensagem do 422 que ele criou manda a vendedora
   * exatamente para a porta aberta: *"para um valor em reais, troque o tipo
   * para VALOR"*.
   *
   * Medido: bruto 500000c (R$ 5.000,00) menos 600000c de desconto dá
   * `Math.max(0, -100000)` = **R$ 0,00** — e é esse zero que a versão ENVIADA
   * congela no hash que a noiva assina.
   */
  it("A07.3 · desconto em VALOR maior que os itens é 422, como o percentual acima de 100", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000, quantidade: 1 });

    // VERMELHO ANTES: 200, e o orçamento passava a valer R$ 0,00 em silêncio.
    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: 6000 });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("DESCONTO_INVALIDO");
    expect(r.body.detalhe).toContain("R$ 5.000,00");

    // O desconto que CABE continua entrando, e o exato-bruto também (zerar por
    // combinação é decisão da loja; zerar por engano de digitação é que não).
    const cabe = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: 500 });
    expect(cabe.status).toBe(200);
    const exato = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: 5000 });
    expect(exato.status).toBe(200);
  });

  /**
   * A07.3 (o par efetivo) — mandar só o VALOR por cima de um tipo já gravado é
   * o mesmo erro, e é como a tela escreve quando a vendedora só troca o número.
   */
  it("A07.3 · o par EFETIVO é o que se valida: só o valor, com o tipo já gravado", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, {
      leadId: lead.id,
      status: "RASCUNHO",
      descontoTipo: "VALOR",
      descontoValor: 100,
    });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 1000, quantidade: 2 });

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoValor: 2500 });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("DESCONTO_INVALIDO");
  });

  /**
   * O14 (metade do servidor) — contrato de comportamento: zero SEMPRE foi
   * aceito, e é por isso que o achado é de tela. Este teste passa nos dois
   * lados do épico de propósito: ele é a prova de que a tela não precisava de
   * rota nova, só do gesto.
   */
  it("O14 · zerar o desconto é 200 e devolve o líquido ao bruto", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, {
      leadId: lead.id,
      status: "RASCUNHO",
      descontoTipo: "VALOR",
      descontoValor: 500,
    });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000, quantidade: 1 });

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoValor: 0 });
    expect(r.status).toBe(200);

    const get = await agent.get(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`);
    expect(get.body.descontoValor).toBe(0);
    // O líquido agregado desce na LISTA (E124/S-D5); o GET do detalhe traz os
    // itens, e é do par (itens, desconto) que a tela deriva o total.
    const lista = await agent.get(`/api/lojas/${f.lojaId}/orcamentos`).query({ q: "" });
    const naLista = (lista.body.itens as { id: string; valorTotal: number }[]).find(
      (o) => o.id === orcamento.id,
    );
    expect(naLista?.valorTotal).toBe(5000);
  });

  /**
   * P7 — o carnê perdia uma parcela e não tinha volta.
   *
   * Medido: contrato de R$ 5.000,00 em 10x. Removida a parcela 10 de
   * R$ 500,00, o plano soma R$ 4.500,00, `origem: PLANO` continua existindo, e
   * o `gerar-plano` respondia **409 JA_TEM_PLANO para sempre** — nenhum gesto
   * da aplicação devolvia aqueles R$ 500,00.
   */
  it("P7 · gerar-plano COMPLETA o carnê que perdeu uma parcela", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000, quantidade: 1 });

    const contrato = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      orcamentoId: orcamento.id,
      valorTotal: 5000,
    });
    expect(contrato.status, JSON.stringify(contrato.body)).toBe(201);
    const contratoId = contrato.body.id as string;

    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
      .send({ numParcelas: 10, primeiroVencimento: dataFutura(30).toISOString() });
    expect(plano.status).toBe(201);
    const decima = (plano.body as { id: string; numero: number; valorPrevisto: number }[]).find(
      (p) => p.numero === 10,
    )!;
    expect(decima.valorPrevisto).toBe(500);

    await agent.delete(`/api/lojas/${f.lojaId}/parcelas/${decima.id}`).expect(204);

    // VERMELHO ANTES: 409 JA_TEM_PLANO — o buraco de R$ 500,00 era definitivo.
    const completa = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
      .send({ numParcelas: 1, primeiroVencimento: dataFutura(330).toISOString() });
    expect(completa.status).toBe(201);
    expect(completa.body).toHaveLength(1);
    expect(completa.body[0].valorPrevisto).toBe(500);

    const depois = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}`);
    const soma = (depois.body.parcelas as { valorPrevisto: number; status: string }[])
      .filter((p) => p.status !== "CANCELADA")
      .reduce((t, p) => t + Math.round(p.valorPrevisto * 100), 0);
    expect(soma).toBe(500000);
  });

  /**
   * P7 (o contrato de comportamento) — carnê que FECHA continua recusando, com
   * o mesmo 409 de sempre. Completar não é gerar de novo.
   */
  it("P7 · carnê completo segue recusando o segundo gerar-plano", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 3000, quantidade: 1 });

    const contrato = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      orcamentoId: orcamento.id,
      valorTotal: 3000,
    });
    expect(contrato.status, JSON.stringify(contrato.body)).toBe(201);
    const contratoId = contrato.body.id as string;

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
      .send({ numParcelas: 3, primeiroVencimento: dataFutura(30).toISOString() })
      .expect(201);

    const denovo = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
      .send({ numParcelas: 3, primeiroVencimento: dataFutura(30).toISOString() });
    expect(denovo.status).toBe(409);
    expect(denovo.body.error).toBe("JA_TEM_PLANO");
  });

  /**
   * S-M10 — campo vazio querendo dizer "apague".
   *
   * `PUT /leads/:id/interesse` monta o upsert com `set: { ...insertData }`:
   * campo ausente some do JSON, some do `set`, e o valor ANTIGO fica. A tela
   * mandava `undefined` para o campo limpo e mostrava "Interesses salvos" — o
   * teto de R$ 8.000,00 continuava R$ 8.000,00, e o aviso "acima do teto" da
   * tela de orçamento seguia acendendo sobre um teto que a noiva já não tem.
   *
   * O conserto é dos dois lados, como a sobra previu: o contrato passa a
   * admitir `null` (`type: ["number","null"]`) e a tela manda `null` no lugar
   * de omitir. `undefined` continua sendo "não mexi" — é o que separa a tela
   * de interesses do `definirTeto` do E2E, que manda só o teto.
   */
  it("S-M10 · null no corpo APAGA o teto; ausente continua sendo 'não mexi'", async () => {
    const lead = await criarLead(f);

    await agent
      .put(`/api/lojas/${f.lojaId}/leads/${lead.id}/interesse`)
      .send({ tetoOrcamento: 8000, algoAMais: "manga longa", naoQuerUsar: "brilho" })
      .expect(200);

    // Ausente: o que já estava fica (o `definirTeto` do E2E depende disto).
    const ausente = await agent
      .put(`/api/lojas/${f.lojaId}/leads/${lead.id}/interesse`)
      .send({ algoAMais: "manga longa" });
    expect(ausente.status).toBe(200);
    expect(ausente.body.tetoOrcamento).toBe(8000);

    // VERMELHO ANTES: 400 CORPO_INVALIDO — o contrato não admitia `null`, e a
    // tela não tinha como dizer "apague".
    const apaga = await agent
      .put(`/api/lojas/${f.lojaId}/leads/${lead.id}/interesse`)
      .send({ tetoOrcamento: null, algoAMais: null, naoQuerUsar: null });
    expect(apaga.status).toBe(200);
    expect(apaga.body.tetoOrcamento).toBeNull();
    expect(apaga.body.algoAMais).toBeNull();
    expect(apaga.body.naoQuerUsar).toBeNull();

    const conferindo = await agent.get(`/api/lojas/${f.lojaId}/leads/${lead.id}`);
    expect(conferindo.body.interesse.tetoOrcamento).toBeNull();
  });
});
