import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E156 — a confecção vira peça do acervo.
 *
 * O E155 pôs a peça sob medida na fila da costureira e registrou, sem modelar, a
 * pergunta que sobrava: depois do casamento, a manga confeccionada vira peça do
 * acervo? **A dona respondeu que vira** (P4).
 *
 * O que este arquivo prega são as três decisões da spec:
 *
 * 1. É um **gesto**, não um gatilho — só a confecção já FEITA vira peça, e por
 *    ato de quem vai alugá-la de novo. Nada vira sozinho quando a data passa.
 * 2. O preço é **digitado**: `ajustes.custo` é o que a costureira cobrou,
 *    `vestidos.precoBase` é o que a noiva paga. Derivar um do outro inventaria
 *    margem.
 * 3. A peça nasce **ativa e sem reserva nenhuma** — o histórico dela começa no
 *    dia em que virou acervo, e nada é reescrito para trás.
 *
 * E a direção do vínculo: a peça do acervo é o que SOBREVIVE, o trabalho da
 * costureira é de onde ela veio.
 */
describe("E156 — a confecção vira peça do acervo", () => {
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

  /** Uma confecção na fila, no estado pedido. */
  async function confeccao(
    opcoes: { status?: "PENDENTE" | "FEITO"; tipo?: "AJUSTE" | "CONFECCAO"; custo?: number } = {},
    lojaFixture: Fixture = f,
    agente = agent,
  ) {
    const { atendimento } = await noivaComProva(lojaFixture, agente);
    const criada = await agente
      .post(`/api/lojas/${lojaFixture.lojaId}/ajustes`)
      .send({
        atendimentoId: atendimento.id,
        descricao: "Manga renda c/ saia lisa",
        tipo: opcoes.tipo ?? "CONFECCAO",
        ...(opcoes.custo != null ? { custo: opcoes.custo } : {}),
      })
      .expect(201);
    if (opcoes.status === "FEITO") {
      await agente
        .patch(`/api/lojas/${lojaFixture.lojaId}/ajustes/${criada.body.id}`)
        .send({ status: "FEITO" })
        .expect(200);
    }
    return criada.body as { id: string; descricao: string };
  }

  let sequenciaCodigo = 0;
  const codigo = () => `CONF-${sequenciaCodigo++}-${Date.now().toString(36)}`;

  it("a confecção feita vira peça do acervo, e a peça guarda de onde veio", async () => {
    const trabalho = await confeccao({ status: "FEITO", custo: 450 });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({
        codigo: codigo(),
        nome: trabalho.descricao,
        // O preço é DIGITADO: 450 foi o que a costureira cobrou; 1800 é o que a
        // noiva paga para alugar. Derivar um do outro inventaria margem.
        precoBase: 1800,
        origemAjusteId: trabalho.id,
      })
      .expect(201);

    expect(r.body.origemAjusteId).toBe(trabalho.id);
    expect(r.body.precoBase).toBe(1800);
    // Nasce ATIVA — o histórico dela começa no dia em que virou acervo.
    expect(r.body.status).toBe("ativo");

    const lida = await agent.get(`/api/lojas/${f.lojaId}/vestidos/${r.body.id}`).expect(200);
    expect(lida.body.origemAjusteId).toBe(trabalho.id);
  });

  it("a peça nasce sem reserva nenhuma — nada é reescrito para trás", async () => {
    const trabalho = await confeccao({ status: "FEITO" });
    const criada = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: codigo(), nome: trabalho.descricao, precoBase: 1200, origemAjusteId: trabalho.id })
      .expect(201);

    const utilizacao = await agent.get(`/api/lojas/${f.lojaId}/vestidos/utilizacao`).expect(200);
    const linha = utilizacao.body.find((v: { vestidoId: string }) => v.vestidoId === criada.body.id);
    // O contrato antigo continua apontando a confecção pelo ajusteId do item
    // (E155); a peça nova entra no acervo com a folha em branco.
    expect(linha).toMatchObject({ provas: 0, reservas: 0, contratos: 0 });
  });

  it("a confecção PENDENTE não vira peça — a manga não existe até a costureira terminar", async () => {
    const trabalho = await confeccao({ status: "PENDENTE" });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: codigo(), nome: trabalho.descricao, precoBase: 1200, origemAjusteId: trabalho.id })
      .expect(422);
    expect(r.body.error).toBe("CONFECCAO_INVALIDA");
  });

  it("ajuste comum não vira peça do acervo — bainha não é peça nova", async () => {
    const trabalho = await confeccao({ tipo: "AJUSTE", status: "FEITO" });
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: codigo(), nome: "Bainha", precoBase: 1200, origemAjusteId: trabalho.id })
      .expect(422);
    expect(r.body.error).toBe("CONFECCAO_INVALIDA");
  });

  it("confecção de outra LOJA não entra — a FK só prova que existe", async () => {
    const outra = await criarFixture();
    const agenteOutra = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
    const alheia = await confeccao({ status: "FEITO" }, outra, agenteOutra);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: codigo(), nome: "Manga alheia", precoBase: 1200, origemAjusteId: alheia.id })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");

    await limparFixture(outra);
  });

  it("a fila mostra a peça que a confecção virou, e só depois de ela existir", async () => {
    const trabalho = await confeccao({ status: "FEITO" });

    const antes = await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    expect(antes.body.find((a: { id: string }) => a.id === trabalho.id).pecaDoAcervo).toBeNull();

    const cod = codigo();
    const criada = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: cod, nome: trabalho.descricao, precoBase: 1200, origemAjusteId: trabalho.id })
      .expect(201);

    const depois = await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const naFila = depois.body.find((a: { id: string }) => a.id === trabalho.id);
    expect(naFila.pecaDoAcervo).toMatchObject({ id: criada.body.id, codigo: cod });
  });

  it("apagar o trabalho da fila não apaga a peça — o acervo é o que sobrevive", async () => {
    const trabalho = await confeccao({ status: "FEITO" });
    const criada = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: codigo(), nome: trabalho.descricao, precoBase: 1200, origemAjusteId: trabalho.id })
      .expect(201);

    await agent.delete(`/api/lojas/${f.lojaId}/ajustes/${trabalho.id}`).expect(204);

    const lida = await agent.get(`/api/lojas/${f.lojaId}/vestidos/${criada.body.id}`).expect(200);
    // A peça continua no acervo, alugável; o que se perde é só a proveniência.
    expect(lida.body.status).toBe("ativo");
    expect(lida.body.origemAjusteId).toBeNull();
  });
});
