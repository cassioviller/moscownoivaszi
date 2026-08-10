import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { diaLocal } from "../lib/disponibilidade";

/**
 * E154 — o acessório de ESTOQUE, que se conta em vez de se reservar.
 *
 * Duas naturezas de "segunda peça", e o que as separa é o mecanismo de
 * disponibilidade: o bolero existe UM e se reserva (E150); o saiote existe DEZ
 * e se conta. Reservar "o saiote nº 7" não significa nada, e cadastrá-los um a
 * um encheria de anágua a lista que a vendedora abre com a noiva na cabine.
 */
// Uma fixture e UM `fecharPool` por arquivo: o pool é do processo, e um
// `afterAll` por describe fecharia a conexão debaixo do describe seguinte.
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

describe("E154 — itens de estoque", () => {
  it("cadastra com quantidade e lista pela loja", async () => {
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Saiote 2 aros", tamanho: "M", quantidade: 10, preco: 80 })
      .expect(201);

    expect(criado.body.quantidade).toBe(10);
    expect(criado.body.ativo).toBe(true);

    const lista = await agent.get(`/api/lojas/${f.lojaId}/itens-estoque`).expect(200);
    expect(lista.body.some((i: { id: string }) => i.id === criado.body.id)).toBe(true);
  });

  it("preço nulo é legítimo: a peça vai junto, sem cobrar à parte", async () => {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Crinol", quantidade: 4 })
      .expect(201);
    expect(r.body.preco).toBeNull();
    expect(r.body.tamanho).toBeNull();
  });

  it("quantidade negativa não passa", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Anágua", quantidade: -1 })
      .expect(400);
  });

  it("editar a quantidade é o gesto de todo dia — a dona conta a arara e corrige", async () => {
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Saiote 3 aros", quantidade: 6 })
      .expect(201);

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/itens-estoque/${criado.body.id}`)
      .send({ quantidade: 4 })
      .expect(200);
    expect(r.body.quantidade).toBe(4);
    // Só o que foi enviado muda.
    expect(r.body.nome).toBe("Saiote 3 aros");
  });

  it("item de outra loja não é encontrado (404) — a fronteira vale aqui como no acervo", async () => {
    const outra = await criarFixture();
    const alheio = await (await loginComLoja(outra.vendedoraEmail, outra.lojaId))
      .post(`/api/lojas/${outra.lojaId}/itens-estoque`)
      .send({ nome: "Véu curto", quantidade: 3 })
      .expect(201);

    await agent
      .patch(`/api/lojas/${f.lojaId}/itens-estoque/${alheio.body.id}`)
      .send({ quantidade: 99 })
      .expect(404);

    await limparFixture(outra);
  });

  it("o mesmo nome com tamanhos diferentes convive; repetir nome+tamanho não", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Saiote liso", tamanho: "P", quantidade: 2 })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Saiote liso", tamanho: "G", quantidade: 2 })
      .expect(201);

    // O par (nome, tamanho) é único por loja — o banco recusa o duplicado.
    const repetido = await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Saiote liso", tamanho: "G", quantidade: 5 });
    expect(repetido.status).toBeGreaterThanOrEqual(400);
  });

  it("o saiote NÃO entra na lista do acervo — é a lista que a vendedora abre na cabine", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome: "Anágua de organza", quantidade: 12 })
      .expect(201);

    const acervo = await agent.get(`/api/lojas/${f.lojaId}/vestidos`).expect(200);
    expect(
      acervo.body.some((v: { nome: string }) => v.nome === "Anágua de organza"),
    ).toBe(false);
  });
});

/**
 * A decisão de projeto do épico: **avisa, não bloqueia.**
 *
 * O comprometimento é DERIVADO dos contratos ativos cuja janela de uso cobre o
 * dia — nunca um contador gravado. E quando ele passa da quantidade, o sistema
 * diz o número e deixa fechar: saiote é substituível, e recusar uma venda de
 * R$ 4.000 por causa de uma anágua é um defeito, não uma proteção.
 */
describe("E154 — o comprometimento do dia", () => {
  /** Um item de estoque com `quantidade` unidades na loja. */
  async function criarItemEstoque(nome: string, quantidade: number) {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome, quantidade })
      .expect(201);
    return r.body as { id: string; nome: string };
  }

  /** Contrato ATIVO que vende `quantidade` unidades do item, para o casamento. */
  async function venderEstoque(params: {
    itemEstoqueId: string;
    quantidade: number;
    casamento: Date;
    valorUnitario?: number;
  }) {
    const valorUnitario = params.valorUnitario ?? 100;
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "ESTOQUE",
      itemEstoqueId: params.itemEstoqueId,
      descricao: "Saiote",
      valorUnitario,
      quantidade: params.quantidade,
    });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: valorUnitario * params.quantidade,
        dataCasamento: params.casamento,
      });
    return r;
  }

  async function comprometimento(dia: string) {
    const r = await agent
      .get(`/api/lojas/${f.lojaId}/itens-estoque/comprometimento`)
      .query({ data: dia })
      .expect(200);
    return r.body as {
      data: string;
      itens: { itemEstoqueId: string; nome: string; quantidade: number; comprometida: number; disponivel: number }[];
    };
  }

  it("comprometer 3 num dia em que a loja tem 2 AVISA e deixa fechar", async () => {
    const item = await criarItemEstoque("Saiote 2 aros", 2);
    const casamento = dataFutura(200);

    // O contrato fecha — é o ponto do épico.
    const contrato = await venderEstoque({
      itemEstoqueId: item.id,
      quantidade: 3,
      casamento,
    });
    expect(contrato.status).toBe(201);

    const dia = diaLocal(casamento);
    const linha = (await comprometimento(dia)).itens.find((i) => i.itemEstoqueId === item.id);
    expect(linha).toMatchObject({ quantidade: 2, comprometida: 3, disponivel: -1 });
  });

  it("o comprometimento morre com a janela de uso: fora dela, o estoque está inteiro", async () => {
    const item = await criarItemEstoque("Crinol curto", 5);
    const casamento = dataFutura(300);
    expect((await venderEstoque({ itemEstoqueId: item.id, quantidade: 4, casamento })).status).toBe(201);

    // Casamento em D; a janela padrão é [D−3, D+2]. Em D+30 não sobra nada preso.
    const longe = new Date(casamento.getTime() + 30 * 86_400_000);
    const linha = (await comprometimento(diaLocal(longe))).itens.find((i) => i.itemEstoqueId === item.id);
    expect(linha).toMatchObject({ comprometida: 0, disponivel: 5 });
  });

  it("contrato CANCELADO devolve a peça ao mercado — a soma cai", async () => {
    const item = await criarItemEstoque("Saiote 3 aros", 4);
    const casamento = dataFutura(250);
    const criado = await venderEstoque({ itemEstoqueId: item.id, quantidade: 3, casamento });
    expect(criado.status).toBe(201);

    const dia = diaLocal(casamento);
    expect((await comprometimento(dia)).itens.find((i) => i.itemEstoqueId === item.id)?.comprometida).toBe(3);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/cancelar`)
      .send({ motivo: "A noiva desistiu" })
      .expect(200);

    expect((await comprometimento(dia)).itens.find((i) => i.itemEstoqueId === item.id)?.comprometida).toBe(0);
  });

  it("item de ESTOQUE não aponta peça do acervo, e peça do acervo não aponta estoque", async () => {
    const item = await criarItemEstoque("Saiote misto", 3);
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });

    // Um item ESTOQUE com `vestidoId` escaparia da guarda do E150 — ela só
    // cobra VESTIDO e ACESSORIO — e venderia um bolero sem reserva.
    const comDuas = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "ESTOQUE", vestidoId: vestido.id, descricao: "Saiote", valorUnitario: 80 })
      .expect(422);
    expect(comDuas.body.error).toBe("ITEM_APONTA_DUAS_PECAS");

    const acessorioComEstoque = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "ACESSORIO", itemEstoqueId: item.id, descricao: "Bolero", valorUnitario: 300 })
      .expect(422);
    expect(acessorioComEstoque.body.error).toBe("ITEM_APONTA_DUAS_PECAS");

    // E o caminho certo passa.
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "ESTOQUE", itemEstoqueId: item.id, descricao: "Saiote misto", valorUnitario: 80 })
      .expect(201);
  });

  it("estoque de outra loja não entra no orçamento desta — a FK só prova que existe", async () => {
    const outra = await criarFixture();
    const alheio = await (await loginComLoja(outra.vendedoraEmail, outra.lojaId))
      .post(`/api/lojas/${outra.lojaId}/itens-estoque`)
      .send({ nome: "Saiote da outra loja", quantidade: 5 })
      .expect(201);

    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "ESTOQUE", itemEstoqueId: alheio.body.id, descricao: "Saiote", valorUnitario: 80 })
      .expect(404);
    expect(r.body.error).toBe("ITEM_ESTOQUE_NAO_ENCONTRADO");

    await limparFixture(outra);
  });

  /**
   * S-M12 — dos três ids do item, o `vestidoId` era o único sem prova de
   * loja: o `itemEstoqueId` tem a do teste acima, o `ajusteId` tem a dupla do
   * E155, e a peça do acervo entrava só com a FK. O item com a peça da loja B
   * passava, e a venda virava beco sem saída — a reserva do E150 responde 422
   * apontando uma peça que ESTA loja nunca poderá reservar.
   */
  it("S-M12 — peça do acervo de outra loja também não entra no orçamento desta", async () => {
    const outra = await criarFixture();
    const vestidoAlheio = await criarVestido(outra);

    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    // VERMELHO ANTES: 201 — a FK provava que a peça existe, não de quem é.
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "VESTIDO", vestidoId: vestidoAlheio.id, descricao: "Vestido", valorUnitario: 4200 })
      .expect(404);
    expect(r.body.error).toBe("VESTIDO_NAO_ENCONTRADO");

    // A peça DESTA loja continua entrando.
    const daCasa = await criarVestido(f);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "VESTIDO", vestidoId: daCasa.id, descricao: "Vestido", valorUnitario: 4200 })
      .expect(201);

    await limparFixture(outra);
  });

  it("dia mal formado é recusado antes de virar conta", async () => {
    await agent
      .get(`/api/lojas/${f.lojaId}/itens-estoque/comprometimento`)
      .query({ data: "19/09/2026" })
      .expect(400);
  });
});
