import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, orcamentosTable, orcamentoVersoesTable, leadsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
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
 * E166 — o link público cumpre o que promete (a metade de servidor).
 *
 * A tese da fatia 1: o congelamento de versão — a peça que existe para
 * garantir que a noiva assine o que viu — não exigia conteúdo (O1), não era
 * conferido contra a validade em porta nenhuma (C6, três lentes), e não
 * cobria metade do que a página dela mostra (O7/C5: observações e validade
 * vinham da linha VIVA, impressas logo acima do comprovante).
 */
describe("E166 — o link público cumpre o que promete", () => {
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

  // ─────────── O1 — a versão nunca congela vazia ─────────────────────────────

  it("O1 · o link de um orçamento SEM item é 422 — o aceite de R$ 0,00 morre na origem", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });

    /**
     * VERMELHO ANTES: 200 — e era a AÇÃO PRIMÁRIA da tela de um orçamento
     * novo. A v1 nascia com totalLiquido 0 e hash do vazio; a página da noiva
     * imprimia Total R$ 0,00 com o botão aceso; ela aceitava, o orçamento ia
     * para APROVADO terminal, e a vendedora não conseguia mais lançar o
     * vestido de R$ 5.000,00 — uma venda inteira sem contrato possível, com o
     * aceite gravado de zero.
     */
    const link = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(link.status).toBe(422);
    expect(link.body.error).toBe("ORCAMENTO_VAZIO");

    // A segunda porta que congela: "marcar como enviado".
    const enviar = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ status: "ENVIADO" });
    expect(enviar.status).toBe(422);
    expect(enviar.body.error).toBe("ORCAMENTO_VAZIO");
  });

  // ─────────── C6/D3 — a validade barra o aceite, e o relink reabre ──────────

  it("C6/D3 · proposta vencida não se aceita (422 com a data), e o relink reabre a validade com versão nova", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });

    const link = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(link.status).toBe(200);

    /**
     * O estado real: a proposta foi ENVIADA e o TEMPO passou — a validade
     * congelada na v1 venceu com a página aberta na mão da noiva. (Escrever a
     * validade vencida ANTES do link não produz este estado: o próprio D3
     * reabre a validade em TODO link de proposta vencida, inclusive o
     * primeiro — descoberto ao escrever este teste, e é o comportamento
     * certo: enviar É reabrir a negociação.)
     */
    await db.update(orcamentosTable)
      .set({ validade: new Date("2026-07-10T12:00:00Z") })
      .where(eq(orcamentosTable.id, orcamento.id));
    await db.update(orcamentoVersoesTable)
      .set({ validade: new Date("2026-07-10T12:00:00Z") })
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id));

    /**
     * VERMELHO ANTES: 200 — o aceite não conferia a validade em porta NENHUMA
     * (C6, A03.4 e O ângulo 07: três lentes, o mesmo furo). A proposta vencida
     * em 10/07 era aceita em 11/08 na MESMA página que dizia "válida até
     * 10/07/2026" — e o contrato fechava em R$ 5.000,00 com a coleção já
     * remarcada para R$ 5.800,00: R$ 800,00 abaixo do preço vigente.
     */
    const aceite = await agent.post(`/api/orcamentos/publico/aceite?token=${link.body.token}`);
    expect(aceite.status).toBe(422);
    expect(aceite.body.error).toBe("VALIDADE_VENCIDA");
    expect(aceite.body.detalhe).toContain("10/07/2026");
    expect(aceite.body.detalhe).toContain("vendedora");

    /**
     * D3 (decisão da dona): o relink REABRE a validade explicitamente — 30
     * dias, a régua da casa — e congela versão NOVA com ela: a noiva aceita o
     * que está vendo, prazo incluído.
     */
    const relink = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(relink.status).toBe(200);
    const [depois] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(depois.validade!.getTime()).toBeGreaterThan(Date.now());
    const [versao] = await db.select().from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
      .orderBy(desc(orcamentoVersoesTable.numero))
      .limit(1);
    expect(versao.numero).toBe(2);
    expect(versao.validade!.getTime()).toBeGreaterThan(Date.now());

    const aceiteNovo = await agent.post(
      `/api/orcamentos/publico/aceite?token=${relink.body.token}&versao=2`,
    );
    expect(aceiteNovo.status).toBe(200);
  });

  // ─────────── O7/C5 — o snapshot cobre o que a página mostra ────────────────

  it("O7/C5 · observações e validade congelam com a versão — a edição posterior não muda o que ela vê", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });
    await db.update(orcamentosTable)
      .set({ observacoes: "Entrada de R$ 1.500,00 e 7x de R$ 500,00" })
      .where(eq(orcamentosTable.id, orcamento.id));

    const link = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(link.status).toBe(200);

    /**
     * VERMELHO ANTES: a observação mudava para "entrada de R$ 2.500,00", o
     * total continuava R$ 5.000,00, o hash continuava batendo — e o
     * comprovante que ela guarda passava a afirmar R$ 1.000,00 A MAIS de
     * entrada sob o mesmo "Aceito em".
     */
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ observacoes: "Entrada de R$ 2.500,00 e 5x de R$ 500,00" })
      .expect(200);

    const pagina = await agent.get(`/api/orcamentos/publico?token=${link.body.token}`);
    expect(pagina.status).toBe(200);
    expect(pagina.body.observacoes).toBe("Entrada de R$ 1.500,00 e 7x de R$ 500,00");
  });

  // ─────────── S-O10 — o "sim" dela vira carimbo ─────────────────────────────

  /**
   * S-O10 — o aceite carimba `leads.aceiteEm`, e o carimbo é independente da
   * ETAPA.
   *
   * A decisão: o aceite não vira coluna do funil (seria a 12ª de um kanban que
   * já se arrasta em 11, e não mexeria na conversão, que conta a partir de
   * CONTRATO_FECHADO). Vira instante, como `orcamentoAbertoEm` e
   * `contratoFechadoEm` já são.
   *
   * **O caso que mais importa é o que a etapa NÃO cobre.** Criar o orçamento já
   * leva a noiva a ORCAMENTO_ABERTO; quando ela aceita, `avancarEtapaLead`
   * devolve a MESMA etapa, e o bloco que grava rodava só quando a etapa mudava.
   * Sem separar as duas coisas, o caso comum — a noiva que já estava em
   * ORCAMENTO_ABERTO — aceitaria sem deixar carimbo, e o selo do funil nunca
   * acenderia justamente para quem ele existe.
   */
  it("S-O10 · o aceite carimba aceiteEm — inclusive quando a etapa NÃO muda", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });
    // A noiva JÁ está na etapa que o aceite levaria: o aceite não a move.
    await db.update(leadsTable).set({ etapa: "ORCAMENTO_ABERTO" }).where(eq(leadsTable.id, lead.id));

    const link = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`);
    expect(link.status).toBe(200);
    await agent.post(`/api/orcamentos/publico/aceite?token=${link.body.token}&versao=1`).expect(200);

    const [depois] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(depois.aceiteEm).not.toBeNull();
    expect(depois.etapa).toBe("ORCAMENTO_ABERTO");
  });

  // ─────────── S-O31 — a porta do link entra na tranca ───────────────────────

  /**
   * S-O31 (achada pela varredura do E171, DENTRO do E166) — o `POST /link`
   * decidia congelar a versão pelo `status` lido no POOL, fora da transação.
   *
   * A decisão `if (orcamento.status === "RASCUNHO")` usava um valor lido antes
   * de qualquer tranca. Dois cliques em "gerar link" no mesmo instante — o
   * duplo-clique da vendedora, ou a rede lenta que faz ela clicar de novo —
   * leem os DOIS `RASCUNHO`, e as duas transações congelam versão: o UPDATE
   * serializa as escritas, mas não desfaz a decisão já tomada com o valor
   * velho. Resultado: **duas versões congeladas da MESMA proposta**, e é a
   * versão congelada que a noiva vê pelo número e que o gate do E115 confere
   * contra o contrato.
   *
   * O conserto é o padrão que este arquivo já usa em toda porta de item
   * (`sobPaiTrancado`, C4/E158): trancar a linha e **reler o que decide**
   * dentro da transação.
   */
  it("S-O31 · dois cliques em 'gerar link' congelam UMA versão, não duas", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });

    // O duplo-clique: as duas chamadas partem juntas, sem esperar a primeira.
    const [a, b] = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`),
      agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`),
    ]);
    // As duas respondem 200: regenerar link É idempotente por contrato (o
    // token novo mata o anterior). O que não pode dobrar é a VERSÃO.
    expect([a.status, b.status]).toEqual([200, 200]);

    const versoes = await db.select().from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id));
    expect(versoes).toHaveLength(1);
    expect(versoes[0].numero).toBe(1);
  });
});
