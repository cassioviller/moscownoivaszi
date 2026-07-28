import { Router, type IRouter } from "express";
import {
  db,
  portalTokensTable,
  lojasTable,
  leadsTable,
  lookbooksTable,
  lookbookItensTable,
  orcamentosTable,
  contratosTable,
  parcelasTable,
  atendimentosTable,
  vestidoFotosTable,
  auditLogTable,
} from "@workspace/db";
import { eq, and, desc, asc, gte, inArray, isNull } from "drizzle-orm";
import {
  GetPortalQueryParams,
  GetPortalResponse,
  AceitarPortalQueryParams,
  AceitarPortalResponse,
  GetPortalFotoQueryParams,
  ConfirmarProvaPortalQueryParams,
  ConfirmarProvaPortalResponse,
  PedirRemarcacaoPortalQueryParams,
  PedirRemarcacaoPortalResponse,
  GetPortalLeadResponse,
  CriarPortalLeadResponse,
  ListPortaisResponse,
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { gerarTokenConvite } from "../lib/auth";
import { leadNaLoja } from "../lib/escopo-loja";
import { aceitarOrcamentoEnviado } from "../lib/aceite-orcamento";
import { montarOrcamentoPublico, montarVestidosLookbook } from "../lib/visao-noiva";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";
import { centavos, estaAberta, reais, saldoAberto } from "@workspace/financeiro-core";

/**
 * E78 — o portal da noiva: UM link para tudo dela. A noiva recebia até três
 * links soltos (orçamento E13, lookbook E21) e nada de provas/parcelas; agora
 * um token por NOIVA abre a proposta (com aceite E74), o lookbook provado,
 * as próximas provas e — depois do contrato — o extrato de parcelas DELA.
 *
 * Mesmo modelo das irmãs públicas: token 256 bits em QUERY (o logger corta a
 * query — jamais cai em log), 404 para desconhecido/revogado, 410 para
 * expirado. Rotas públicas primeiro; gestão atrás de sessão + módulo leads.
 */
const PORTAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const router: IRouter = Router();

/** Portal válido com noiva e loja, ou o motivo da recusa. */
async function buscarPorToken(token: string) {
  const [linha] = await db
    .select({ portal: portalTokensTable, lojaNome: lojasTable.nome, lead: leadsTable })
    .from(portalTokensTable)
    .innerJoin(lojasTable, eq(lojasTable.id, portalTokensTable.lojaId))
    .innerJoin(leadsTable, eq(leadsTable.id, portalTokensTable.leadId))
    .where(eq(portalTokensTable.token, token));
  // Revogado responde como desconhecido (404), não 410: "expirou" convida a
  // pedir outro; o link morto de propósito não deve dizer que um dia valeu.
  if (!linha || linha.portal.revogadoEm) return null;
  return linha;
}

/**
 * A proposta que o portal exibe (e que o aceite mira): a mais recente que a
 * vendedora ENVIOU — aprovada continua aparecendo como comprovante.
 */
async function orcamentoDoPortal(lojaId: string, leadId: string) {
  const [orcamento] = await db
    .select()
    .from(orcamentosTable)
    .where(and(
      eq(orcamentosTable.lojaId, lojaId),
      eq(orcamentosTable.leadId, leadId),
      inArray(orcamentosTable.status, ["ENVIADO", "APROVADO"]),
    ))
    .orderBy(desc(orcamentosTable.createdAt))
    .limit(1);
  return orcamento ?? null;
}

router.get("/portal", async (req, res): Promise<void> => {
  const parsed = GetPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }
  const { portal, lojaNome, lead } = linha;

  // "Ela abriu" do card da vendedora — cada abertura move o carimbo.
  await db.update(portalTokensTable)
    .set({ ultimoAcessoEm: new Date() })
    .where(eq(portalTokensTable.id, portal.id));

  const agora = new Date();
  const [orcamento, lookbook, provas, contrato] = await Promise.all([
    orcamentoDoPortal(portal.lojaId, portal.leadId),
    // O lookbook mais recente da noiva — o portal não depende do token antigo.
    db.select().from(lookbooksTable)
      .where(and(eq(lookbooksTable.lojaId, portal.lojaId), eq(lookbooksTable.leadId, portal.leadId)))
      .orderBy(desc(lookbooksTable.createdAt))
      .limit(1),
    // Só as futuras: o portal aponta para a frente. O id endereça o E85
    // (confirmar presença por este link).
    db.select({
      id: atendimentosTable.id,
      inicio: atendimentosTable.inicio,
      confirmadoEm: atendimentosTable.confirmadoEm,
      remarcacaoPedidaEm: atendimentosTable.remarcacaoPedidaEm,
    })
      .from(atendimentosTable)
      .where(and(
        eq(atendimentosTable.lojaId, portal.lojaId),
        eq(atendimentosTable.leadId, portal.leadId),
        eq(atendimentosTable.tipo, "PROVA"),
        gte(atendimentosTable.inicio, agora),
      ))
      .orderBy(asc(atendimentosTable.inicio)),
    db.select().from(contratosTable)
      .where(and(
        eq(contratosTable.lojaId, portal.lojaId),
        eq(contratosTable.leadId, portal.leadId),
        eq(contratosTable.status, "ATIVO"),
      ))
      .orderBy(desc(contratosTable.fechadoEm))
      .limit(1),
  ]);

  // O extrato DELA: as parcelas do contrato ativo, por número. O escopo por
  // contratoId (do contrato DESTA noiva) é o que garante que valores de outra
  // noiva jamais aparecem.
  const parcelas = contrato[0]
    ? await db.select().from(parcelasTable)
        .where(eq(parcelasTable.contratoId, contrato[0].id))
        .orderBy(asc(parcelasTable.numero))
    : [];

  /**
   * F36/E100 — as duas respostas que ela abre o link para procurar.
   *
   * O extrato lista oito linhas num celular e não dizia "falta pagar R$ X" nem
   * "a próxima vence em DD/MM" — a uma soma de distância. Cada pergunta que o
   * portal não responde volta como mensagem de WhatsApp para a vendedora, que é
   * exatamente o custo que o E78 existia para reduzir.
   *
   * Em centavos, pelo mesmo motor do resto do sistema: `saldoAberto` desconta o
   * que já entrou numa parcela PARCIAL — mostrar o previsto cheio cobraria de
   * novo o que ela já pagou, na tela dela.
   */
  const abertas = parcelas.filter((p) => estaAberta(p));
  const faltaPagarC = abertas.reduce((s, p) => s + centavos(saldoAberto(p)), 0);
  const proxima = [...abertas].sort(
    (a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime(),
  )[0];

  res.json(
    GetPortalResponse.parse({
      noivaNome: lead.noivaNome,
      lojaNome,
      // Só quando há contrato: sem ele, um "falta pagar R$ 0,00" afirmaria algo
      // sobre um acordo que não existe.
      resumoPagamento: contrato[0]
        ? {
            faltaPagar: reais(faltaPagarC),
            proximaEm: proxima?.vencimento ?? null,
            proximaValor: proxima ? saldoAberto(proxima) : null,
          }
        : null,
      orcamento: orcamento
        ? await montarOrcamentoPublico(orcamento, lojaNome, lead.noivaNome)
        : null,
      lookbook: lookbook[0]
        ? { vestidos: await montarVestidosLookbook(lookbook[0].id) }
        : null,
      provas,
      parcelas: parcelas
        .filter((p) => p.status !== "CANCELADA")
        .map((p) => ({
          numero: p.numero,
          descricao: p.descricao,
          valorPrevisto: p.valorPrevisto,
          valorRecebido: p.valorRecebido,
          vencimento: p.vencimento,
          status: p.status,
        })),
    }),
  );
});

// O aceite pelo portal delega à MESMA rotina do E74 (uma transação, um
// invariante) — o alvo é o mesmo orçamento que o GET exibe.
router.post("/portal/aceite", async (req, res): Promise<void> => {
  const parsed = AceitarPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  const orcamento = await orcamentoDoPortal(linha.portal.lojaId, linha.portal.leadId);
  if (!orcamento) {
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: "Não há proposta enviada" });
    return;
  }
  // Idempotente: o clique duplo devolve o aceite que já existe.
  if (orcamento.aceitoEm) {
    res.json(AceitarPortalResponse.parse({ aceitoEm: orcamento.aceitoEm }));
    return;
  }
  if (orcamento.status !== "ENVIADO") {
    res.status(422).json({ error: "NAO_ENVIADO", detalhe: `Orçamento está ${orcamento.status}` });
    return;
  }

  const aceitoEm = await aceitarOrcamentoEnviado(orcamento, linha.lead.noivaNome);
  res.json(AceitarPortalResponse.parse({ aceitoEm }));
});

// E85: a noiva confirma a presença pelo portal — o MESMO carimbo do E39
// (confirmadoEm), com a noiva como autora na auditoria, como no aceite. A
// rota autenticada continua a dela: autoria de sessão é outra rotina.
router.post("/portal/provas/:atendimentoId/confirmar", async (req, res): Promise<void> => {
  const parsed = ConfirmarProvaPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  // O token escopa: a prova tem de ser DO lead do portal — de outra noiva é
  // 404 mesmo existindo, como na foto.
  const atendimentoId = req.params.atendimentoId as string;
  const prova = await db.query.atendimentosTable.findFirst({
    where: and(
      eq(atendimentosTable.id, atendimentoId),
      eq(atendimentosTable.lojaId, linha.portal.lojaId),
      eq(atendimentosTable.leadId, linha.portal.leadId),
    ),
  });
  if (!prova) {
    res.status(404).json({ error: "PROVA_INEXISTENTE" });
    return;
  }
  // Idempotente ANTES das réguas: a prova confirmada ontem que virou hoje não
  // pode responder 422 no segundo clique.
  if (prova.confirmadoEm) {
    res.json(ConfirmarProvaPortalResponse.parse({ confirmadoEm: prova.confirmadoEm }));
    return;
  }
  if (prova.tipo !== "PROVA" || prova.situacao !== "AGENDADO" || prova.inicio <= new Date()) {
    res.status(422).json({ error: "NADA_A_CONFIRMAR", detalhe: "não é uma prova futura agendada" });
    return;
  }

  const agora = new Date();
  await db.transaction(async (tx) => {
    // UPDATE condicional: dois cliques simultâneos gravam UM carimbo.
    const [atualizado] = await tx
      .update(atendimentosTable)
      .set({ confirmadoEm: agora, updatedAt: agora })
      .where(and(eq(atendimentosTable.id, prova.id), isNull(atendimentosTable.confirmadoEm)))
      .returning();
    if (!atualizado) return;

    // Autoria da NOIVA, sem sessão — o mesmo rastro do aceite (E74).
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: linha.portal.lojaId,
      usuarioId: null,
      usuarioNome: `${linha.lead.noivaNome} (link público)`,
      acao: "PROVA_CONFIRMADA",
      entidade: "atendimento",
      entidadeId: prova.id,
      detalhe: { inicio: prova.inicio.toISOString() },
    });
  });

  const [depois] = await db.select({ confirmadoEm: atendimentosTable.confirmadoEm })
    .from(atendimentosTable)
    .where(eq(atendimentosTable.id, prova.id));
  res.json(ConfirmarProvaPortalResponse.parse({ confirmadoEm: depois.confirmadoEm ?? agora }));
});

/**
 * F37/E100 — a noiva avisa que NÃO pode ir.
 *
 * A única ação dela aqui era "confirmo que vou", e ninguém abre um link para
 * dizer que vai: abre para dizer que não. Este aviso devolve à loja os três
 * recursos mais caros do ateliê — cabine, hora da vendedora e vestido separado —
 * com antecedência, em vez de com a ausência.
 */
router.post("/portal/provas/:atendimentoId/remarcar", async (req, res): Promise<void> => {
  const parsed = PedirRemarcacaoPortalQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  const atendimentoId = req.params.atendimentoId as string;
  const prova = await db.query.atendimentosTable.findFirst({
    where: and(
      eq(atendimentosTable.id, atendimentoId),
      eq(atendimentosTable.lojaId, linha.portal.lojaId),
      eq(atendimentosTable.leadId, linha.portal.leadId),
    ),
  });
  if (!prova) {
    res.status(404).json({ error: "PROVA_INEXISTENTE" });
    return;
  }
  // Idempotente ANTES das réguas, como no confirmar: o segundo clique devolve o
  // mesmo carimbo em vez de um 422 que a noiva leria como "não deu certo".
  if (prova.remarcacaoPedidaEm) {
    res.json(PedirRemarcacaoPortalResponse.parse({ remarcacaoPedidaEm: prova.remarcacaoPedidaEm }));
    return;
  }
  // Quem JÁ CONFIRMOU não desmarca por aqui. A loja tomou decisão física em
  // cima daquele sim — separou a peça, reservou a cabine, escalou a costureira —
  // e desfazer isso por um clique num link, sem ninguém saber, é pior que a
  // conversa de trinta segundos com a vendedora.
  if (prova.confirmadoEm) {
    res.status(422).json({
      error: "JA_CONFIRMADA",
      detalhe: "Você já confirmou esta prova — fale com a sua vendedora para remarcar.",
    });
    return;
  }
  if (prova.tipo !== "PROVA" || prova.situacao !== "AGENDADO" || prova.inicio <= new Date()) {
    res.status(422).json({ error: "NADA_A_REMARCAR", detalhe: "não é uma prova futura agendada" });
    return;
  }

  const agora = new Date();
  await db.transaction(async (tx) => {
    // UPDATE condicional: dois cliques simultâneos gravam UM carimbo.
    const [atualizado] = await tx
      .update(atendimentosTable)
      .set({ remarcacaoPedidaEm: agora, updatedAt: agora })
      .where(and(
        eq(atendimentosTable.id, prova.id),
        isNull(atendimentosTable.remarcacaoPedidaEm),
      ))
      .returning();
    if (!atualizado) return;

    // Autoria da NOIVA, sem sessão — o mesmo rastro do aceite (E74) e da
    // confirmação (E85).
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: linha.portal.lojaId,
      usuarioId: null,
      usuarioNome: `${linha.lead.noivaNome} (link público)`,
      acao: "REMARCACAO_PEDIDA",
      entidade: "atendimento",
      entidadeId: prova.id,
      detalhe: { inicio: prova.inicio.toISOString() },
    });
  });

  const [depois] = await db.select({ remarcacaoPedidaEm: atendimentosTable.remarcacaoPedidaEm })
    .from(atendimentosTable)
    .where(eq(atendimentosTable.id, prova.id));
  res.json(PedirRemarcacaoPortalResponse.parse({
    remarcacaoPedidaEm: depois.remarcacaoPedidaEm ?? agora,
  }));
});

// A foto escopada ao token do PORTAL — espelho de /lookbooks/publico/foto,
// para o portal não depender do token antigo do lookbook (pode ter expirado).
router.get("/portal/foto", async (req, res): Promise<void> => {
  const parsed = GetPortalFotoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { token, vestidoId, ordem, variante = "original", v } = parsed.data;

  const linha = await buscarPorToken(token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.portal.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  // O escopo: o vestido tem de estar no lookbook mais recente DA noiva.
  const [lookbook] = await db.select({ id: lookbooksTable.id }).from(lookbooksTable)
    .where(and(
      eq(lookbooksTable.lojaId, linha.portal.lojaId),
      eq(lookbooksTable.leadId, linha.portal.leadId),
    ))
    .orderBy(desc(lookbooksTable.createdAt))
    .limit(1);
  const [pertence] = lookbook
    ? await db.select({ id: lookbookItensTable.id }).from(lookbookItensTable)
        .where(and(
          eq(lookbookItensTable.lookbookId, lookbook.id),
          eq(lookbookItensTable.vestidoId, vestidoId),
        ))
    : [];
  if (!pertence) {
    res.status(404).json({ error: "Foto not found" });
    return;
  }

  const foto = await db.query.vestidoFotosTable.findFirst({
    where: and(eq(vestidoFotosTable.vestidoId, vestidoId), eq(vestidoFotosTable.ordem, ordem)),
  });
  if (!foto) {
    res.status(404).json({ error: "Foto not found" });
    return;
  }

  // Mesmo contrato de cache das irmãs (E3).
  const servirThumb = variante === "thumb" && foto.thumbBytes != null;
  const etag = `"${vestidoId}-${ordem}-${servirThumb ? "t" : "c"}-${foto.updatedAt.getTime()}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", servirThumb ? foto.thumbMime ?? foto.mime : foto.mime);
  res.setHeader(
    "Cache-Control",
    v ? "private, max-age=31536000, immutable" : "private, max-age=60, must-revalidate",
  );
  res.setHeader("ETag", etag);
  res.send(servirThumb ? foto.thumbBytes : foto.bytes);
});

// ── Gestão (sessão + módulo leads: o portal é parte do atendimento da noiva) ──

// E84: os portais da loja num lote — mensagens e cobrança cruzam por leadId
// para anexar o link à mensagem. Uma linha por noiva; quem decide se está
// vivo é o cliente (a régua é a mesma do card).
router.get(
  "/lojas/:lojaId/portais",
  requireSessaoComLoja,
  requireModulo("leads", "ver"),
  async (req, res): Promise<void> => {
    const lojaId = req.params.lojaId as string;
    const portais = await db.select().from(portalTokensTable)
      .where(eq(portalTokensTable.lojaId, lojaId));
    res.json(ListPortaisResponse.parse(portais));
  },
);

router.use("/lojas/:lojaId/leads/:leadId/portal", requireSessaoComLoja);

router.get(
  "/lojas/:lojaId/leads/:leadId/portal",
  requireModulo("leads", "ver"),
  async (req, res): Promise<void> => {
    const { lojaId, leadId } = req.params as { lojaId: string; leadId: string };
    const [portal] = await db.select().from(portalTokensTable)
      .where(and(eq(portalTokensTable.lojaId, lojaId), eq(portalTokensTable.leadId, leadId)));
    if (!portal) {
      res.status(404).json({ error: "PORTAL_INEXISTENTE" });
      return;
    }
    res.json(GetPortalLeadResponse.parse(portal));
  },
);

router.post(
  "/lojas/:lojaId/leads/:leadId/portal",
  requireModulo("leads", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, leadId } = req.params as { lojaId: string; leadId: string };
    if (!(await leadNaLoja(leadId, lojaId))) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    // Regenerar MATA o link antigo: leadId é unique — o token novo substitui
    // o velho na mesma linha, e revogado volta à vida com token novo.
    const token = gerarTokenConvite();
    const expiraEm = new Date(Date.now() + PORTAL_TTL_MS);
    const [portal] = await db.insert(portalTokensTable)
      .values({ id: randomUUID(), lojaId, leadId, token, expiraEm })
      .onConflictDoUpdate({
        target: portalTokensTable.leadId,
        set: { token, expiraEm, revogadoEm: null, criadoEm: new Date() },
      })
      .returning();
    res.status(201).json(CriarPortalLeadResponse.parse(portal));
  },
);

router.delete(
  "/lojas/:lojaId/leads/:leadId/portal",
  requireModulo("leads", "editar"),
  async (req, res): Promise<void> => {
    const { lojaId, leadId } = req.params as { lojaId: string; leadId: string };
    await db.update(portalTokensTable)
      .set({ revogadoEm: new Date() })
      .where(and(eq(portalTokensTable.lojaId, lojaId), eq(portalTokensTable.leadId, leadId)));
    res.status(204).send();
  },
);

export default router;
