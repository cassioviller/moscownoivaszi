import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarContrato,
  type Fixture,
} from "./helpers";

/**
 * E124 — o que se procura se acha: busca por noiva, página e recentes-primeiro
 * em contratos e orçamentos.
 *
 * O vermelho-antes, medido executando no banco de dev (loja `84e539bd`):
 * `GET /contratos` devolvia 518 contratos num payload de 615.041 bytes com o
 * mais ANTIGO primeiro (fechadoEm 2026-01-10 no topo, o de hoje no fim), sem
 * `q` nem página; `GET /orcamentos` devolvia 246.611 bytes embutindo `itens`
 * que NENHUMA tela lia (S-D5). A busca usa a MESMA régua do listLeads
 * (`lib/busca-lead.ts`), coberta pelos índices trigram — medido 0,7 ms.
 */
describe("E124 — busca, página e recentes-primeiro no acervo", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let mariana: Awaited<ReturnType<typeof criarLead>>;
  let beatriz: Awaited<ReturnType<typeof criarLead>>;
  let contratoAntigo: Awaited<ReturnType<typeof criarContrato>>;
  let contratoNovo: Awaited<ReturnType<typeof criarContrato>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    mariana = await criarLead(f, {
      noivaNome: "Mariana Busca E124",
      whatsapp: "(11) 97777-1234",
    });
    beatriz = await criarLead(f, { noivaNome: "Beatriz Acervo E124" });

    // O caso do D1: o contrato da semana passada atrás do de janeiro.
    contratoAntigo = await criarContrato(f, {
      leadId: beatriz.id,
      valorTotal: 4200,
      fechadoEm: new Date("2026-01-10T15:00:00Z"),
    });
    contratoNovo = await criarContrato(f, {
      leadId: mariana.id,
      valorTotal: 8400,
      fechadoEm: new Date("2026-07-22T15:00:00Z"),
    });

    // Orçamento com itens e desconto — o valorTotal agregado tem de sair da
    // régua única: bruto 2 × R$ 3.000,00 − 10% = R$ 5.400,00.
    const orcMariana = await criarOrcamento(f, {
      leadId: mariana.id,
      descontoTipo: "PERCENTUAL",
      descontoValor: 10,
    });
    await criarOrcamentoItem(f, {
      orcamentoId: orcMariana.id,
      valorUnitario: 3000,
      quantidade: 2,
    });
    await criarOrcamento(f, { leadId: beatriz.id });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("contratos: o default é recentes-primeiro — o de julho vem antes do de janeiro (P2)", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/contratos`).expect(200);
    const ids = res.body.itens.map((c: { id: string }) => c.id);
    expect(ids.indexOf(contratoNovo.id)).toBeLessThan(ids.indexOf(contratoAntigo.id));
  });

  it("contratos: ?ordem=antigos preserva a leitura histórica", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?ordem=antigos`)
      .expect(200);
    const ids = res.body.itens.map((c: { id: string }) => c.id);
    expect(ids.indexOf(contratoAntigo.id)).toBeLessThan(ids.indexOf(contratoNovo.id));
  });

  it("contratos: ?q= acha pelo nome da noiva, e por dígitos do WhatsApp", async () => {
    const porNome = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?q=mariana busca`)
      .expect(200);
    expect(porNome.body.itens).toHaveLength(1);
    expect(porNome.body.itens[0].leadId).toBe(mariana.id);

    const porDigitos = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?q=97777`)
      .expect(200);
    expect(porDigitos.body.itens.map((c: { id: string }) => c.id)).toContain(contratoNovo.id);
  });

  it("contratos: ?status= recorta no banco e a página fatia com total honesto", async () => {
    const ativos = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?status=ATIVO&pagina=1&porPagina=1`)
      .expect(200);
    expect(ativos.body.itens).toHaveLength(1);
    expect(ativos.body.total).toBe(2);

    const pagina2 = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?status=ATIVO&pagina=2&porPagina=1`)
      .expect(200);
    expect(pagina2.body.itens).toHaveLength(1);
    expect(pagina2.body.itens[0].id).not.toBe(ativos.body.itens[0].id);
  });

  it("orçamentos: a listagem geral NÃO embute itens e traz valorTotal pela régua única (S-D5)", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/orcamentos`).expect(200);
    const daMariana = res.body.itens.find(
      (o: { leadId: string }) => o.leadId === mariana.id,
    );
    // 2 × R$ 3.000,00 − 10% = R$ 5.400,00 — a MESMA conta do POST /contratos.
    expect(daMariana.valorTotal).toBe(5400);
    expect(daMariana.itens).toBeUndefined();
  });

  it("orçamentos: o recorte ?leadId= mantém os itens (contrato do E62)", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/orcamentos?leadId=${mariana.id}`)
      .expect(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0].itens).toHaveLength(1);
    expect(res.body.itens[0].valorTotal).toBe(5400);
  });

  it("orçamentos: ?q= acha pelo nome e o default é recentes-primeiro", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/orcamentos?q=beatriz acervo`)
      .expect(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0].leadId).toBe(beatriz.id);

    const todos = await agent.get(`/api/lojas/${f.lojaId}/orcamentos`).expect(200);
    const criadosEm = todos.body.itens.map((o: { createdAt: string }) => o.createdAt);
    const ordenadoDesc = [...criadosEm].sort().reverse();
    expect(criadosEm).toEqual(ordenadoDesc);
  });

  /**
   * S-M14 — o que se digita é LITERAL, nas duas buscas que compartilham a
   * régua (`padraoDeBusca`): a de leads e a do acervo. `%${busca}%` cru
   * deixava `%` e `_` valendo como curinga do LIKE — buscar `%` devolvia o
   * cadastro inteiro, e colar "50% entrada" de um orçamento buscava outra
   * coisa sem dizer que buscou.
   */
  it("S-M14 — buscar `%` não devolve o cadastro inteiro, nas duas buscas", async () => {
    // VERMELHO ANTES: as duas noivas da fixture voltavam — o `%` era curinga.
    const leads = await agent
      .get(`/api/lojas/${f.lojaId}/leads?q=${encodeURIComponent("%")}`)
      .expect(200);
    expect(leads.body.itens ?? leads.body).toHaveLength(0);

    const contratos = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?q=${encodeURIComponent("%")}`)
      .expect(200);
    expect(contratos.body.itens).toHaveLength(0);

    // E o `_` também é literal: "Marian_" não pode casar "Mariana".
    const sublinhado = await agent
      .get(`/api/lojas/${f.lojaId}/leads?q=${encodeURIComponent("Marian_")}`)
      .expect(200);
    expect(sublinhado.body.itens ?? sublinhado.body).toHaveLength(0);

    // A busca de verdade continua achando.
    const porNome = await agent
      .get(`/api/lojas/${f.lojaId}/leads?q=mariana busca`)
      .expect(200);
    expect((porNome.body.itens ?? porNome.body).map((l: { id: string }) => l.id)).toContain(mariana.id);
  });

  // ÚLTIMO do describe de propósito: cria noiva, orçamentos e contrato
  // próprios, e os testes acima pregam contagens (total de ATIVOs, orçamentos
  // por noiva) que não podem ver estes registros.
  it("contratos: ?orcamentoId= devolve só o contrato daquele orçamento (E144/S-D16)", async () => {
    // O caso da tela: o detalhe do orçamento só quer saber "este orçamento já
    // virou contrato?" — e baixava a loja inteira (615 KB) para um find.
    const clara = await criarLead(f, { noivaNome: "Clara Filtro E144" });
    const orc = await criarOrcamento(f, { leadId: clara.id });
    const contratoDoOrc = await criarContrato(f, {
      leadId: clara.id,
      orcamentoId: orc.id,
      valorTotal: 5400,
      fechadoEm: new Date("2026-07-25T15:00:00Z"),
    });

    const res = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?orcamentoId=${orc.id}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0].id).toBe(contratoDoOrc.id);

    // Orçamento sem contrato: lista vazia com total zero — é o que alterna
    // o botão para "Gerar contrato".
    const semContrato = await criarOrcamento(f, { leadId: clara.id });
    const vazio = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?orcamentoId=${semContrato.id}`)
      .expect(200);
    expect(vazio.body.total).toBe(0);
    expect(vazio.body.itens).toEqual([]);
  });
});
