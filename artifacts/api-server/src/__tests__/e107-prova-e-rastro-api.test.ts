import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, auditLogTable, contasPagarTable, parcelasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
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
 * E107 — o rabo de integridade do E91/E94/E96.
 *
 * Quatro escritas que não tinham terminado de aprender o que aqueles três
 * épicos ensinaram: um id que entra sem prova de a quem pertence (S2), uma
 * obrigação que some sem rastro (S4), uma leitura fora da transação que
 * corrompe a trilha (S6) e um campo de código que carregava frase (S12).
 */
describe("E107 — nenhuma escrita sem prova, nenhum dinheiro sem rastro", () => {
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

  // ── S2: a reserva física é DESTA noiva ──

  /** Uma reserva de vestido, opcionalmente já com dona. */
  async function reservaDe(leadId: string | null) {
    const vestido = await criarVestido(f);
    return criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      leadId,
      casamentoData: dataFutura(90),
    });
  }

  /**
   * O caso do achado. A conferência antiga provava a LOJA e parava aí — o
   * vestido que a noiva B provou e reservou passava a responder pelo contrato
   * de A, sem erro nenhum.
   */
  it("contrato NÃO prende a reserva de outra noiva da mesma loja", async () => {
    const noivaA = await criarLead(f);
    const noivaB = await criarLead(f);
    const reservaDaB = await reservaDe(noivaB.id);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: noivaA.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoIds: [reservaDaB.id],
      })
      .expect(422);

    // E145 (S-D12): o código deixou de ser REFERENCIA_INVALIDA — a tela de
    // orçamento traduzia esse código genérico como "Essa noiva não é desta
    // loja.", sombreando o detalhe que explica o caso de verdade.
    expect(r.body.error).toBe("RESERVA_DE_OUTRA_NOIVA");
    expect(r.body.detalhe).toMatch(/outra noiva/);
  });

  /**
   * O caso legítimo e comum, que a guarda não pode atrapalhar: a loja segurou a
   * peça antes de saber de quem seria, e é o contrato que lhe dá dono.
   */
  it("reserva SEM dona é aceita — é o contrato que lhe dá dono", async () => {
    const noiva = await criarLead(f);
    const reservaLivre = await reservaDe(null);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: noiva.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoIds: [reservaLivre.id],
      })
      .expect(201);
  });

  it("a reserva da PRÓPRIA noiva é aceita", async () => {
    const noiva = await criarLead(f);
    const reservaDela = await reservaDe(noiva.id);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: noiva.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoIds: [reservaDela.id],
      })
      .expect(201);
  });

  // ── S4: apagar conta prevista deixa rastro ──

  async function criarConta(valorPrevisto: number) {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({
        descricao: `Conta E107 ${randomUUID().slice(0, 6)}`,
        valorPrevisto,
        vencimento: dataFutura(15).toISOString(),
        tipo: "DESPESA",
      })
      .expect(201);
    return r.body as { id: string; descricao: string };
  }

  /**
   * O que não estiver no detalhe da trilha está perdido: depois do DELETE não
   * há linha para consultar. Por isso o teste afirma o VALOR, e não só que
   * alguma linha de auditoria apareceu.
   */
  it("apagar uma conta prevista grava na trilha o valor e o vencimento", async () => {
    const conta = await criarConta(1234.56);

    await agent.delete(`/api/lojas/${f.lojaId}/contas-pagar/${conta.id}`).expect(204);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.entidadeId, conta.id),
        eq(auditLogTable.acao, "CONTA_PAGAR_REMOVIDA"),
      ));
    expect(linha).toBeDefined();
    expect((linha.detalhe as { valorPrevisto: number }).valorPrevisto).toBe(1234.56);
    expect((linha.detalhe as { descricao: string }).descricao).toBe(conta.descricao);
    expect(linha.usuarioNome).toBeTruthy();

    // E a conta sumiu de verdade — a trilha não é consolo por delete que falhou.
    const [sumiu] = await db
      .select()
      .from(contasPagarTable)
      .where(eq(contasPagarTable.id, conta.id));
    expect(sumiu).toBeUndefined();
  });

  // ── S6: o estorno concorrente audita UMA vez ──

  /**
   * Dois cliques simultâneos convergiam no banco (o `SET` é absoluto), e por
   * isso o achado é 🔵: não se perde dinheiro. **O que se perdia era a verdade
   * da trilha** — os dois liam `valorRecebido: 1.000` e os dois auditavam
   * 1.000, dizendo que R$ 2.000 saíram de uma parcela de R$ 1.000.
   */
  it("dois estornos simultâneos deixam UM registro na trilha, com o valor certo", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 1000,
      fechadoEm: dataFutura(-5),
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 1, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    const [parcela] = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contrato.id));
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 1000, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);

    // Os dois ao mesmo tempo, como o duplo clique faz.
    const respostas = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`),
      agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`),
    ]);
    // Um deles estorna. O outro pode receber 200 (passou pela guarda e o UPDATE
    // condicional não casou) ou 422 (a guarda de fora já viu PREVISTA) — quem
    // ganha a corrida depende do relógio, e afirmar um dos dois seria um teste
    // que passa por sorte. **O invariante não depende disso**, e é o de baixo.
    expect(respostas.some((r) => r.status === 200)).toBe(true);
    for (const r of respostas) expect([200, 422]).toContain(r.status);

    const trilha = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.entidadeId, parcela.id),
        eq(auditLogTable.acao, "RECEBIMENTO_ESTORNADO"),
      ));
    /**
     * O invariante: **UM estorno aconteceu, logo UMA linha na trilha** — não
     * importa quantas respostas deram 200. Antes, os dois liam
     * `valorRecebido: 1.000` e os dois gravavam 1.000, e a trilha dizia que
     * R$ 2.000 saíram de uma parcela de R$ 1.000.
     *
     * Escrevi primeiro `toHaveLength(confirmados)`, copiando o molde do E94/B6
     * ("nada é auditado que a API não tenha confirmado"), e o assert **é falso
     * por construção aqui**: com o `UPDATE` condicional, o perdedor recebe 200
     * sem auditar — é o caminho idempotente, e ele pediu "estornada", que é o
     * que a parcela está. Lá os valores diferiam e a correspondência valia;
     * aqui não. O teste passava sozinho e falhava na suíte completa.
     */
    expect(trilha).toHaveLength(1);
    expect((trilha[0].detalhe as { valorRecebido: number }).valorRecebido).toBe(1000);

    // E a parcela ficou estornada, que é o que os dois pediram.
    const [depois] = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.id, parcela.id));
    expect(depois.status).toBe("PREVISTA");
    expect(depois.valorRecebido).toBeNull();
  });

  // ── S12: o 409 do Postgres sai como código ──

  /**
   * O caso concreto que motiva o item: um 409 de unicidade apareceu na suíte
   * como "Registro duplicado ou conflito de dados" no meio de um fluxo de
   * dinheiro, e foi lido como regressão financeira. Agora ele se identifica.
   */
  it("a violação de unicidade do banco chega à tela como CÓDIGO, não como frase", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 2000,
      fechadoEm: dataFutura(-5),
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);

    // Gerar o plano de novo bate na unicidade (contrato_id, numero).
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() });

    if (r.status === 409) {
      expect(r.body.error).toMatch(/^[A-Z][A-Z_]*$/);
      expect(r.body.error).not.toMatch(/\s/);
    }
  });

  /**
   * E107 — a trilha sobrevive a uma ação que ela não conhece.
   *
   * Isto não é um caso de borda: é o **contrato de projeto** do E10, escrito no
   * schema do banco — *"`acao` é texto versionado pela aplicação, não pgEnum:
   * trilha nova não pode exigir migration para existir"* — e repetido no
   * `ROTULO_ACAO`, frouxo de propósito *"porque tela velha lendo trilha nova não
   * pode quebrar"*.
   *
   * O `AuditoriaItem.acao` do openapi era um **enum fechado**, e contradizia os
   * dois. O preço não era formatação: `ListAuditoriaResponse.parse()` estoura no
   * primeiro registro desconhecido e **a lista inteira morre** — não só a linha.
   * Uma `CONTA_PAGAR_REMOVIDA` no banco de dev apagou a trilha da tela, e quem
   * pegou foi o E2E, não os 740 testes de API.
   */


  it("uma ação FUTURA, que nenhuma união conhece hoje, não derruba a lista", async () => {
    // O que o E10 promete: gravar ação nova não exige migration nem regeneração
    // de spec. Este insert é o que uma versão futura do servidor faria.
    await db.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      usuarioId: f.superAdminId,
      usuarioNome: "Teste E107",
      acao: "ACAO_QUE_AINDA_NAO_EXISTE",
      entidade: "coisa",
      entidadeId: randomUUID(),
      detalhe: { origem: "teste de contrato aberto" },
    });

    const r = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/auditoria`)
      .expect(200);

    const acoes = (r.body as { acao: string }[]).map((l) => l.acao);
    expect(acoes).toContain("ACAO_QUE_AINDA_NAO_EXISTE");
  });

  it("e o CSV também sai, com o código cru no lugar do rótulo", async () => {
    await db.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      usuarioId: f.superAdminId,
      usuarioNome: "Teste E107",
      acao: "OUTRA_ACAO_FUTURA",
      entidade: "coisa",
      entidadeId: randomUUID(),
    });

    const r = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/auditoria/exportar`)
      .expect(200);

    expect(r.text).toContain("OUTRA_ACAO_FUTURA");
  });});
