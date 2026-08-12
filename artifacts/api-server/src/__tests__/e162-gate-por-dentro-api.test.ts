import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  db,
  auditLogTable,
  leadsTable,
  orcamentosTable,
  perfisTable,
  usuariosTable,
  usuariosLojasTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { hashSenha } from "../lib/auth";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";

/**
 * E162 — o aceite ganha um caminho até o contrato. O épico-bandeira.
 *
 * O ângulo 01 mediu o vão em uma frase: o sistema tinha UM criador de reserva
 * (sessão + módulo `vestidos`), nenhum dos caminhos que fecham a venda o
 * chamava, o `POST /contratos` cobrava a reserva que ninguém criou — e como o
 * aceite congela o orçamento em APROVADO terminal, o vão virava BECO (A01.2 🔴):
 * reservar 409, trocar item 422, voltar status 422, contratar 422. R$ 5.000,00
 * de compromisso gravado e zero de venda, sem nenhum botão de saída.
 *
 * A decisão da dona (D1) foi a opção (c): o aceite NÃO reserva; nasce a fila
 * "aceitos sem contrato", e o diálogo de contrato cria a reserva na hora. Este
 * arquivo prova o caminho inteiro — que NENHUM teste do repositório cruzava
 * (A01.6: 10 provas do caminho, nenhuma cobrindo o encontro das metades).
 */
describe("E162 — o gate por dentro: aceite → fila → reserva inline → contrato", () => {
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

  /** Orçamento com peça REAL do acervo (o caminho que nenhum teste cruzava). */
  async function orcamentoComPecaReal(valor = 4000) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const item = await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "VESTIDO",
      vestidoId: vestido.id,
      valorUnitario: valor,
    });
    const link = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(link.status).toBe(200);
    return { lead, vestido, orcamento, item, token: link.body.token as string };
  }

  function aceitar(token: string) {
    return agent.post(`/api/orcamentos/publico/aceite?token=${token}`);
  }

  // ─────────── O caminho inteiro, de ponta a ponta ───────────────────────────

  it("A01.6/A01.2 · o caminho real da loja atravessa o gate: aceite → fila → reservar → contrato 201", async () => {
    const { lead, vestido, orcamento, token } = await orcamentoComPecaReal(4000);

    // 1. A noiva aceita pelo link — domingo, 22h, sem sessão.
    await aceitar(token).expect(200);

    /**
     * 2. O aceite aparece na FILA — a primeira consulta do sistema que cruza
     * orçamento com contrato (A04.1/A04.2: três greps provaram que nenhuma
     * tela, card ou agregação existia; o tempo até alguém notar era
     * ilimitado). Com a peça ainda sem reserva, a linha diz o risco.
     */
    const fila = await agent.get(`/api/lojas/${f.lojaId}/orcamentos/aceitos-sem-contrato`);
    expect(fila.status).toBe(200);
    const linha = fila.body.find((a: { orcamentoId: string }) => a.orcamentoId === orcamento.id);
    expect(linha).toBeDefined();
    expect(linha.valor).toBe(4000);
    expect(linha.noivaNome).toBe(lead.noivaNome);
    expect(linha.pecasSemReserva).toBe(1);

    // 3. As candidatas dizem a verdade: nenhuma reserva ainda.
    const antes = await agent.get(
      `/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservas-candidatas`,
    );
    expect(antes.status).toBe(200);
    expect(antes.body).toHaveLength(0);

    /**
     * 4. A reserva nasce DE DENTRO do fluxo de venda (R10): a porta exige
     * `leads.criar`, o alcance é só peça que o orçamento vende, e ela nasce
     * em nome da noiva DELE.
     *
     * VERMELHO ANTES (o beco inteiro): este endpoint não existia, o
     * `POST /bloqueios` exigia módulo `vestidos`, e o `POST /contratos`
     * abaixo respondia 422 ITEM_SEM_RESERVA sem caminho nenhum.
     */
    const reservar = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservar`)
      .send({ vestidoId: vestido.id, casamentoData: dataFutura(180) });
    expect(reservar.status).toBe(201);
    expect(reservar.body.leadId).toBe(lead.id);
    expect(reservar.body.tipo).toBe("RESERVA_CASAMENTO");

    // 5. A candidata aparece, e o contrato fecha por DENTRO do gate.
    const depois = await agent.get(
      `/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservas-candidatas`,
    );
    expect(depois.body).toHaveLength(1);

    const contrato = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      orcamentoId: orcamento.id,
      valorTotal: 4000,
      bloqueioVestidoIds: [reservar.body.id],
      dataCasamento: dataFutura(180),
    });
    expect(contrato.status).toBe(201);

    // 6. E a fila esvazia: o aceite virou venda.
    const filaDepois = await agent.get(`/api/lojas/${f.lojaId}/orcamentos/aceitos-sem-contrato`);
    expect(
      filaDepois.body.find((a: { orcamentoId: string }) => a.orcamentoId === orcamento.id),
    ).toBeUndefined();
  });

  // ─────────── R10 — a permissão, medida com o perfil real ───────────────────

  /**
   * **E172 trocou a PERSONA deste teste, não a decisão que ele prega.**
   *
   * A decisão do R10 é uma só: *reservar a peça que a venda vende não exige o
   * módulo do ACERVO* — a reserva nasce de dentro do fluxo, com alcance restrito
   * às peças daquele orçamento. Ela continua inteira.
   *
   * O que mudou é quem faz a venda. Até 2026-08-12 o orçamento vivia sob
   * `leads`, então o perfil que este teste montava — "leads ver+criar+editar,
   * vestidos só ver" — era a Recepção, e ela vendia. O E172 tirou a proposta de
   * `leads` justamente porque isso deixava quem atende o telefone aprovando
   * propostas de R$ 5.000,00 (S-O40, uma porta ao lado). Hoje o perfil que
   * monta a venda sem o acervo é `orcamentos` cheio + `vestidos` só ver, e a
   * Recepção não é mais ele.
   *
   * Sem esta troca o teste passaria a medir o gate NOVO em vez da decisão do
   * R10: reprovava com `expected 403 to be 201`, e o 403 estava certo.
   */
  it("R10 · quem tem orcamentos.criar SEM vestidos reserva a peça da venda — e segue barrada no acervo", async () => {
    const { lead, vestido, orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);
    void lead;

    // Quem monta a venda sem mexer no acervo: `orcamentos` inteiro (é dele que
    // a porta do `reservar` depende), `leads` para chegar à noiva, `vestidos` só
    // ver.
    const sufixo = randomUUID().slice(0, 8);
    const perfilId = randomUUID();
    await db.insert(perfisTable).values({
      id: perfilId,
      nome: `Vendedora sem acervo E162 ${sufixo}`,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        orcamentos: { ver: true, criar: true, editar: true },
        vestidos: { ver: true },
      },
    });
    const vendedoraSemAcervoId = randomUUID();
    const vendedoraSemAcervoEmail = `vendedora-sem-acervo-e162-${sufixo}@teste.local`;
    await db.insert(usuariosTable).values({
      id: vendedoraSemAcervoId,
      nome: `Vendedora sem acervo ${sufixo}`,
      email: vendedoraSemAcervoEmail,
      senhaHash: await hashSenha(SENHA_TESTE),
    });
    await db
      .insert(usuariosLojasTable)
      .values({ usuarioId: vendedoraSemAcervoId, lojaId: f.lojaId, perfilId });

    try {
      const vende = await loginComLoja(vendedoraSemAcervoEmail, f.lojaId);

      // VERMELHO ANTES: a única porta era POST /bloqueios, módulo vestidos —
      // ela montava a venda, o contrato mandava reservar, e o reservar dava
      // 403 sem que nenhuma das mensagens dissesse que era permissão.
      const peloAcervo = await vende.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
        vestidoId: vestido.id,
        tipo: "RESERVA_CASAMENTO",
        casamentoData: dataFutura(150),
      });
      expect(peloAcervo.status).toBe(403);

      const pelaVenda = await vende
        .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservar`)
        .send({ vestidoId: vestido.id, casamentoData: dataFutura(150) });
      expect(pelaVenda.status).toBe(201);
    } finally {
      await db
        .delete(usuariosLojasTable)
        .where(eq(usuariosLojasTable.usuarioId, vendedoraSemAcervoId));
      await db.delete(usuariosTable).where(eq(usuariosTable.id, vendedoraSemAcervoId));
      await db.delete(perfisTable).where(eq(perfisTable.id, perfilId));
    }
  });

  /**
   * E172, o outro lado da mesma moeda: a Recepção de HOJE não monta venda.
   *
   * O teste acima deixou de descrevê-la, e o que ela pode virou pergunta em
   * aberto — esta é a resposta, medida na porta. Ela lê a proposta e não a
   * move, então também não reserva por dentro dela.
   */
  it("R10/E172 · a Recepção de hoje não reserva pela venda — ela não faz a venda", async () => {
    const { vestido, orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);

    const sufixo = randomUUID().slice(0, 8);
    const perfilId = randomUUID();
    await db.insert(perfisTable).values({
      id: perfilId,
      nome: `Recepcao E172 ${sufixo}`,
      acessosModulos: {
        leads: { ver: true, criar: true, editar: true },
        orcamentos: { ver: true },
        vestidos: { ver: true },
      },
    });
    const recepcaoId = randomUUID();
    const recepcaoEmail = `recepcao-e172-${sufixo}@teste.local`;
    await db.insert(usuariosTable).values({
      id: recepcaoId,
      nome: `Recepcao ${sufixo}`,
      email: recepcaoEmail,
      senhaHash: await hashSenha(SENHA_TESTE),
    });
    await db.insert(usuariosLojasTable).values({ usuarioId: recepcaoId, lojaId: f.lojaId, perfilId });

    try {
      const recepcao = await loginComLoja(recepcaoEmail, f.lojaId);
      const pelaVenda = await recepcao
        .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservar`)
        .send({ vestidoId: vestido.id, casamentoData: dataFutura(150) });
      expect(pelaVenda.status).toBe(403);
      expect(pelaVenda.body.modulo).toBe("orcamentos");
    } finally {
      await db.delete(usuariosLojasTable).where(eq(usuariosLojasTable.usuarioId, recepcaoId));
      await db.delete(usuariosTable).where(eq(usuariosTable.id, recepcaoId));
      await db.delete(perfisTable).where(eq(perfisTable.id, perfilId));
    }
  });

  it("R10 · o alcance é estreito: peça que o orçamento NÃO vende leva 422", async () => {
    const { orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);
    const outroVestido = await criarVestido(f);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservar`)
      .send({ vestidoId: outroVestido.id, casamentoData: dataFutura(150) });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("PECA_FORA_DO_ORCAMENTO");
  });

  it("R10 · a régua de disponibilidade é a mesma: peça ocupada leva 409 com conflitos", async () => {
    const { vestido, orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);
    const dataDisputada = dataFutura(200);

    // Outra noiva já segurou a peça para o mesmo sábado.
    const outraNoiva = await criarLead(f);
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataDisputada,
      leadId: outraNoiva.id,
    });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservar`)
      .send({ vestidoId: vestido.id, casamentoData: dataDisputada });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("VESTIDO_INDISPONIVEL");
    expect(r.body.conflitos.length).toBeGreaterThan(0);
  });

  // ─────────── A01.2 — a porta gerencial do beco ─────────────────────────────

  it("A01.2 · desfazer o aceite reabre o caminho: RASCUNHO, campos limpos, trilha gravada", async () => {
    const { orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);

    /**
     * VERMELHO ANTES: não havia porta nenhuma. `TRANSICOES_ORCAMENTO.APROVADO`
     * é lista vazia, o PATCH devolvia 422, e as outras três paredes também.
     */
    const desfazer = await agent.post(
      `/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/desfazer-aceite`,
    );
    expect(desfazer.status).toBe(200);
    expect(desfazer.body.status).toBe("RASCUNHO");

    const [depois] = await db.select().from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamento.id));
    expect(depois.aceitoEm).toBeNull();
    expect(depois.aceiteVersao).toBeNull();
    expect(depois.aceiteHash).toBeNull();
    expect(depois.aprovadoEm).toBeNull();

    // O aceite desfeito NÃO some da história.
    const [trilha] = await db.select().from(auditLogTable)
      .where(and(
        eq(auditLogTable.acao, "ORCAMENTO_ACEITE_DESFEITO"),
        eq(auditLogTable.entidadeId, orcamento.id),
      ));
    expect(trilha).toBeDefined();
    expect((trilha.detalhe as { aceiteHash: string | null }).aceiteHash).not.toBeNull();
  });

  it("A01.2 · com contrato apontando, o aceite não se desfaz: 409", async () => {
    const { lead, vestido, orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);
    const reservar = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservar`)
      .send({ vestidoId: vestido.id, casamentoData: dataFutura(180) });
    expect(reservar.status).toBe(201);
    await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      orcamentoId: orcamento.id,
      valorTotal: 4000,
      bloqueioVestidoIds: [reservar.body.id],
      dataCasamento: dataFutura(180),
    }).expect(201);

    const r = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/desfazer-aceite`);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("ORCAMENTO_JA_VINCULADO");
  });

  it("A01.2/S-O8 · o gatilho REAL da versão 2: desfazer → editar → relink congela v2, e a aba velha leva 409", async () => {
    const { orcamento, item, token } = await orcamentoComPecaReal(5000);
    await aceitar(token).expect(200);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/desfazer-aceite`)
      .expect(200);

    // De volta a RASCUNHO, o conteúdo muda — a peça saiu, o valor mudou.
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ valorUnitario: 5500 })
      .expect(200);

    /**
     * O relink congela a VERSÃO 2 — `criarVersaoEnviada` roda no
     * RASCUNHO→ENVIADO. Era o gatilho que a S-O8 registrou como inexistente:
     * o teste do E160 inseria a v2 à mão; este a produz pelo PRODUTO, e a
     * guarda `versaoVista` (C2) é conferida contra o caminho real.
     */
    const novoLink = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(novoLink.status).toBe(200);
    const tokenNovo = novoLink.body.token as string;

    // A aba antiga da noiva ainda mostra a v1 de R$ 5.000,00.
    const abaVelha = await agent.post(`/api/orcamentos/publico/aceite?token=${tokenNovo}&versao=1`);
    expect(abaVelha.status).toBe(409);
    expect(abaVelha.body.error).toBe("PROPOSTA_MUDOU");

    // Recarregada, ela aceita a v2 — os R$ 5.500,00 que está vendo.
    const abaNova = await agent.post(`/api/orcamentos/publico/aceite?token=${tokenNovo}&versao=2`);
    expect(abaNova.status).toBe(200);
    const [depois] = await db.select().from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamento.id));
    expect(depois.aceiteVersao).toBe(2);
  });

  // ─────────── A04.6 — o aceite mexe no funil ────────────────────────────────

  it("A04.6 · o aceite avança a noiva até ORCAMENTO_ABERTO quando ela estava atrás", async () => {
    const lead = await criarLead(f); // nasce NOVO
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 3000 });
    const link = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    await aceitar(link.body.token as string).expect(200);

    /**
     * VERMELHO ANTES: a noiva que disse SIM continuava em NOVO — a fixture
     * cria o orçamento por fora, e nem `marcarOrcamentoAberto` (só na criação
     * pela rota) nem o aceite mexiam na etapa. A ficha instruía "Enviar a
     * proposta para ela" sobre uma proposta aceita.
     */
    const [depois] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(depois.etapa).toBe("ORCAMENTO_ABERTO");
  });

  // ─────────── A02.4 — as candidatas incluem a sem dona ──────────────────────

  it("A02.4 · a reserva SEM DONA da peça vendida entra nas candidatas; a de outra noiva não", async () => {
    const { vestido, orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);

    // A colega segurou a peça no sábado antes de saber o nome da noiva.
    const semDona = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(220),
      leadId: null,
    });
    // E outra noiva tem reserva da MESMA peça — essa não é candidata.
    const outraNoiva = await criarLead(f);
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(300),
      leadId: outraNoiva.id,
    });

    /**
     * VERMELHO ANTES: a tela filtrava por `leadId=` e a sem dona — o caso que
     * `contratos.ts` chama de "legítimo e comum" (61 de 63 no dev) — ficava
     * invisível: o diálogo nem desenhava a caixa, e a vendedora tomava o 422
     * sem ter como apontar a reserva que existia e o servidor aceitaria.
     */
    const r = await agent.get(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservas-candidatas`);
    expect(r.status).toBe(200);
    const ids = r.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(semDona.id);
    expect(r.body.some((b: { leadId: string | null }) => b.leadId === outraNoiva.id)).toBe(false);
  });

  it("V12 · `casamentoData: null` no reservar é 422, não uma reserva em 1970", async () => {
    const { vestido, orcamento, token } = await orcamentoComPecaReal();
    await aceitar(token).expect(200);
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/reservar`)
      .send({ vestidoId: vestido.id, casamentoData: null });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("DATA_DE_CASAMENTO_INVALIDA");
  });
});
