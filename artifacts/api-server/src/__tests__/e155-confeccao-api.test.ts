import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarBloqueio,
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
 * E155 — a peça sob medida entra na fila da costureira, que já existe.
 *
 * No caderno de 10–16/08: `Siam + Manga **será confeccionada** + Mantilha`. E na
 * agenda, dois compromissos de 10:30 marcados só para o assunto (21/07 e
 * 24/07, *"conversar sobre confecção de manga"*). Não é ajuste de peça
 * existente: é peça NOVA, feita para aquela noiva — e o modelo não tinha lugar
 * para ela.
 *
 * O que este arquivo prega é que a fila é a mesma de propósito (prazo, status e
 * checklist já existiam e são os mesmos), que o tipo distingue as duas
 * naturezas, e que o item que COBRA a confecção aponta o trabalho — provado
 * pela noiva, não só pela loja.
 */
describe("E155 — confecção na fila da costureira", () => {
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

  // Atendimentos têm UNIQUE (loja, vendedora, inicio): cada prova numa hora.
  let sequenciaProva = 0;

  /** Uma noiva com prova marcada — de onde nasce todo trabalho de agulha. */
  async function noivaComProva(lojaFixture: Fixture = f, agente = agent) {
    const inicio = new Date(dataFutura(60).getTime() + sequenciaProva++ * 3_600_000);
    const lead = await criarLead(lojaFixture, { casamentoData: dataFutura(90) });
    const vestido = await criarVestido(lojaFixture);
    const bloqueio = await criarBloqueio(lojaFixture, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const cabine = await agente
      .post(`/api/lojas/${lojaFixture.lojaId}/cabines`)
      .send({ nome: `Cabine ${bloqueio.id.slice(0, 6)}` })
      .expect(201);
    const atendimento = await agente
      .post(`/api/lojas/${lojaFixture.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId: cabine.body.id,
        vendedoraId: lojaFixture.vendedoraId,
        tipo: "PROVA",
        bloqueioId: bloqueio.id,
        inicio: inicio.toISOString(),
      })
      .expect(201);
    return { lead, atendimento: atendimento.body as { id: string } };
  }

  it("a confecção entra na mesma fila, com tipo e custo", async () => {
    const { atendimento } = await noivaComProva();
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({
        atendimentoId: atendimento.id,
        descricao: "Manga renda c/ saia lisa",
        tipo: "CONFECCAO",
        custo: 450,
      })
      .expect(201);

    expect(r.body.tipo).toBe("CONFECCAO");
    expect(r.body.custo).toBe(450);
    // Prazo e status são os mesmos do ajuste — é por isso que é a mesma fila.
    expect(r.body.status).toBe("PENDENTE");

    const fila = await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const naFila = fila.body.find((a: { id: string }) => a.id === r.body.id);
    expect(naFila.tipo).toBe("CONFECCAO");
    // A régua do prazo não mudou: a confecção tem `proximaProva` como qualquer
    // ajuste (null aqui, porque não há prova DEPOIS da que a gerou).
    expect(naFila).toHaveProperty("proximaProva");
  });

  it("sem dizer o tipo, é AJUSTE — todo trabalho que já estava na fila continua sendo o que era", async () => {
    const { atendimento } = await noivaComProva();
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Bainha 3cm" })
      .expect(201);
    expect(r.body.tipo).toBe("AJUSTE");
    expect(r.body.custo).toBeNull();
  });

  it("o custo aparece depois — no dia da conversa quase nunca se sabe quanto vai custar", async () => {
    const { atendimento } = await noivaComProva();
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Manga", tipo: "CONFECCAO" })
      .expect(201);
    expect(criado.body.custo).toBeNull();

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/ajustes/${criado.body.id}`)
      .send({ custo: 380 })
      .expect(200);
    expect(r.body.custo).toBe(380);
    expect(r.body.tipo).toBe("CONFECCAO");
  });

  it("o item que cobra a confecção aponta o trabalho na fila", async () => {
    const { lead, atendimento } = await noivaComProva();
    const confeccao = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Manga renda", tipo: "CONFECCAO", custo: 450 })
      .expect(201);

    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const item = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({
        tipo: "AJUSTE",
        ajusteId: confeccao.body.id,
        descricao: "Manga renda",
        valorUnitario: 600,
      })
      .expect(201);

    expect(item.body.ajusteId).toBe(confeccao.body.id);
  });

  it("cobrar a confecção de OUTRA noiva é recusado — a prova é da noiva, não só da loja", async () => {
    const outraNoiva = await noivaComProva();
    const confeccaoDela = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: outraNoiva.atendimento.id, descricao: "Manga da outra", tipo: "CONFECCAO" })
      .expect(201);

    // Mesma loja, mesmo tipo, id existente — e ainda assim não pode: o
    // orçamento é de outra noiva, e as duas leriam que a peça está paga.
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({
        tipo: "AJUSTE",
        ajusteId: confeccaoDela.body.id,
        descricao: "Manga renda",
        valorUnitario: 600,
      })
      .expect(404);
    expect(r.body.error).toBe("AJUSTE_NAO_ENCONTRADO");
  });

  it("só item do tipo AJUSTE aponta trabalho da fila", async () => {
    const { lead, atendimento } = await noivaComProva();
    const confeccao = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: atendimento.id, descricao: "Manga", tipo: "CONFECCAO" })
      .expect(201);

    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({
        // Cobrar a manga como VESTIDO faria a peça nova entrar na conta do
        // acervo — e ela não é do acervo, é da costureira.
        tipo: "VESTIDO",
        ajusteId: confeccao.body.id,
        descricao: "Manga renda",
        valorUnitario: 600,
      })
      .expect(422);
    expect(r.body.error).toBe("ITEM_APONTA_DUAS_PECAS");
  });

  it("trabalho de outra LOJA não entra — a FK só prova que existe", async () => {
    const outra = await criarFixture();
    const agenteOutra = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
    const alheia = await noivaComProva(outra, agenteOutra);
    const confeccaoAlheia = await agenteOutra
      .post(`/api/lojas/${outra.lojaId}/ajustes`)
      .send({ atendimentoId: alheia.atendimento.id, descricao: "Manga alheia", tipo: "CONFECCAO" })
      .expect(201);

    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({
        tipo: "AJUSTE",
        ajusteId: confeccaoAlheia.body.id,
        descricao: "Manga renda",
        valorUnitario: 600,
      })
      .expect(404);

    await limparFixture(outra);
  });
});
