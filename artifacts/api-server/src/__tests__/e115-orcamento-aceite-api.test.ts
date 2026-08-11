import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E115 — o aceite certifica um conteúdo; o contrato nasce DELE.
 *
 * O E75 deixa editar os itens vivos de um orçamento ENVIADO de propósito (a
 * noiva vê a versão congelada no envio, não o rascunho). Mas três leitores
 * liam três coisas: o aceite gravava o hash da versão CONGELADA, o portal
 * mostrava essa versão, e o `POST /contratos` validava contra os itens VIVOS.
 * Editado o item de R$ 5.000,00 para R$ 5.500,00 com o link na mão da noiva,
 * ela aceitava R$ 5.000,00 — e o único contrato que o servidor criava era de
 * R$ 5.500,00: a noiva assinava um PDF de valor que nunca aceitou.
 *
 * E depois do aceite nada congelava os itens: um APROVADO seguia editável,
 * deixando aceite, portal e contrato para trás.
 */
describe("E115 — o contrato nasce do que a noiva aceitou", () => {
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

  async function orcamentoEnviado(valor: number) {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const item = await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: valor });
    const link = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`)
      .expect(200);
    return { lead, orcamento, item, token: link.body.token as string };
  }

  function aceitar(token: string) {
    return agent.post(`/api/orcamentos/publico/aceite?token=${token}`);
  }

  it("orçamento editado depois do envio NÃO vira contrato pelo valor que ela não viu", async () => {
    const { lead, orcamento, item, token } = await orcamentoEnviado(5000);

    // E75: editar o vivo de um ENVIADO é permitido — a noiva segue vendo a v1.
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ valorUnitario: 5500 })
      .expect(200);

    // A noiva aceita o que VIU: a versão 1, de R$ 5.000,00.
    await aceitar(token).expect(200);

    // VERMELHO ANTES: 201 — o contrato nascia dos itens vivos (R$ 5.500,00)
    // com o aceite registrado em R$ 5.000,00.
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 5500, orcamentoId: orcamento.id })
      .expect(422);
    expect(r.body.error).toBe("ORCAMENTO_DIVERGE_DO_ACEITE");
  });

  it("orçamento APROVADO não muda mais — item e desconto congelam", async () => {
    const { orcamento, item, token } = await orcamentoEnviado(5000);
    await aceitar(token).expect(200);

    // VERMELHO ANTES: 200/201/204 — o acordo fechado seguia editável.
    const patch = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ valorUnitario: 9999 })
      .expect(422);
    expect(patch.body.error).toBe("ORCAMENTO_APROVADO");

    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Taxa surpresa", valorUnitario: 100, quantidade: 1 })
      .expect(422);

    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`).expect(422);

    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: 1000 })
      .expect(422);
  });

  /**
   * E170/A07.1 — as duas metades encadeadas, até a SAÍDA.
   *
   * Os dois testes acima provavam as duas metades do beco em orçamentos
   * DIFERENTES e ninguém encadeava: o de `:55` deixava a venda parada no 422 e
   * declarava vitória, o de `:76` provava as quatro paredes num orçamento novo.
   * A suíte ficava verde sobre **R$ 5.000,00 aceitos, R$ 5.500,00 pedidos e
   * R$ 0,00 contratáveis** — o defeito que o A07.1 mediu, escrito como se fosse
   * a intenção.
   *
   * Este teste percorre o beco INTEIRO no mesmo orçamento e não para na parede:
   * cobra a porta gerencial do E162 (`/desfazer-aceite`) e exige que os
   * R$ 5.500,00 fechem contrato no fim. Sem a porta, ele fica vermelho — que é
   * o estado em que a loja realmente estava.
   */
  it("A07.1 · o beco tem saída: divergiu, travou nas quatro portas, desfez o aceite e a venda fecha", async () => {
    const { lead, orcamento, item, token } = await orcamentoEnviado(5000);

    // A negociação mexe no preço depois do envio — o gesto mais comum que existe.
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ valorUnitario: 5500 })
      .expect(200);
    await aceitar(token).expect(200);

    // Metade 1 — o contrato não sai por NENHUM valor: o hash é conferido antes.
    for (const valorTotal of [5500, 5000]) {
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/contratos`)
        .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal, orcamentoId: orcamento.id })
        .expect(422);
      expect(r.body.error).toBe("ORCAMENTO_DIVERGE_DO_ACEITE");
    }

    // Metade 2 — no MESMO orçamento, as quatro portas de conserto estão fechadas.
    const voltarOItem = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ valorUnitario: 5000 })
      .expect(422);
    expect(voltarOItem.body.error).toBe("ORCAMENTO_APROVADO");
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Abatimento", valorUnitario: 100, quantidade: 1 })
      .expect(422);
    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`).expect(422);
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: 500 })
      .expect(422);

    // A SAÍDA (E162/A01.2) — é aqui que o teste velho não chegava.
    const desfazer = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/desfazer-aceite`)
      .expect(200);
    expect(desfazer.body.status).toBe("RASCUNHO");

    // Relink congela a v2 de R$ 5.500,00, e a noiva aceita o que passa a ver.
    const novoLink = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`)
      .expect(200);
    await agent
      .post(`/api/orcamentos/publico/aceite?token=${novoLink.body.token}&versao=2`)
      .expect(200);

    // Os R$ 5.500,00 fecham. A venda que o beco engolia volta ao sistema.
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 5500, orcamentoId: orcamento.id })
      .expect(201);
  });

  it("sem divergência, o aceite e o contrato falam do mesmo número", async () => {
    const { lead, orcamento, token } = await orcamentoEnviado(5000);
    await aceitar(token).expect(200);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 5000, orcamentoId: orcamento.id })
      .expect(201);
  });
});
