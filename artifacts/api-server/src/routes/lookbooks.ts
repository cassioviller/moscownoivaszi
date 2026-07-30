import { Router, type IRouter } from "express";
import {
  db,
  lookbooksTable,
  lookbookItensTable,
  lojasTable,
  leadsTable,
  vestidosTable,
  vestidoFotosTable,
  vestidoAtributosTable,
  atributosTable,
  atributoOpcoesTable,
} from "@workspace/db";
import { eq, and, gt, inArray, desc, asc } from "drizzle-orm";
import {
  GetLookbookPublicoQueryParams,
  GetLookbookPublicoResponse,
  GetLookbookPublicoFotoQueryParams,
  ListLookbooksQueryParams,
  ListLookbooksResponse,
  CreateLookbookBody,
  CreateLookbookResponse,
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { gerarTokenConvite } from "../lib/auth";
import { leadNaLoja } from "../lib/escopo-loja";
import { montarVestidosLookbook } from "../lib/visao-noiva";
import { randomUUID } from "node:crypto";
import { erroDeValidacao } from "../lib/erros";

/**
 * Lookbook (E21): a seleção do atendimento vira link para a noiva rever em
 * casa. Rotas públicas primeiro (montadas antes dos routers de domínio);
 * gestão atrás de sessão + módulo leads — o lookbook é parte do atendimento
 * da noiva, não da gestão do acervo.
 *
 * O link vale 30 dias: mais folga que o convite (a noiva volta ao lookbook
 * até decidir), mas nunca porta eterna ao catálogo.
 */
const LOOKBOOK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const router: IRouter = Router();

/** Lookbook válido (existe e não expirou) ou null; `expirado` vira 410. */
async function buscarPorToken(token: string) {
  const [linha] = await db
    .select({ lookbook: lookbooksTable, lojaNome: lojasTable.nome, noivaNome: leadsTable.noivaNome })
    .from(lookbooksTable)
    .innerJoin(lojasTable, eq(lojasTable.id, lookbooksTable.lojaId))
    .innerJoin(leadsTable, eq(leadsTable.id, lookbooksTable.leadId))
    .where(eq(lookbooksTable.token, token));
  return linha ?? null;
}

router.get("/lookbooks/publico", async (req, res): Promise<void> => {
  const parsed = GetLookbookPublicoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const linha = await buscarPorToken(parsed.data.token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.lookbook.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }

  // E44/E78: a montagem (fotos + características legíveis) mora em
  // lib/visao-noiva — o portal exibe o MESMO lookbook por outra porta.
  res.json(GetLookbookPublicoResponse.parse({
    lojaNome: linha.lojaNome,
    noivaNome: linha.noivaNome,
    vestidos: await montarVestidosLookbook(linha.lookbook.id),
  }));
});

// A foto sem login, escopada ao TOKEN: vestido fora da seleção é 404 mesmo
// existindo — o link do lookbook não é chave do catálogo inteiro.
router.get("/lookbooks/publico/foto", async (req, res): Promise<void> => {
  const parsed = GetLookbookPublicoFotoQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { token, vestidoId, ordem, variante = "cheia", v } = parsed.data;

  const linha = await buscarPorToken(token);
  if (!linha) {
    res.status(404).json({ error: "LINK_INVALIDO" });
    return;
  }
  if (linha.lookbook.expiraEm <= new Date()) {
    res.status(410).json({ error: "LINK_EXPIRADO" });
    return;
  }
  const [pertence] = await db
    .select({ id: lookbookItensTable.id })
    .from(lookbookItensTable)
    .where(and(
      eq(lookbookItensTable.lookbookId, linha.lookbook.id),
      eq(lookbookItensTable.vestidoId, vestidoId),
    ));
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

  // Mesmo contrato de cache da rota autenticada de foto (E3).
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

// ── Gestão (sessão + módulo leads: o lookbook é do atendimento da noiva) ──
router.use("/lojas/:lojaId/lookbooks", requireSessaoComLoja, requireModulo("leads"));

/** Lookbooks de uma noiva com os nomes dos vestidos, mais recente primeiro. */
async function listarDaNoiva(lojaId: string, leadId: string) {
  const lookbooks = await db
    .select()
    .from(lookbooksTable)
    .where(and(eq(lookbooksTable.lojaId, lojaId), eq(lookbooksTable.leadId, leadId)))
    .orderBy(desc(lookbooksTable.createdAt));
  if (lookbooks.length === 0) return [];

  const itens = await db
    .select({
      lookbookId: lookbookItensTable.lookbookId,
      vestidoId: lookbookItensTable.vestidoId,
      nome: vestidosTable.nome,
      ordem: lookbookItensTable.ordem,
    })
    .from(lookbookItensTable)
    .innerJoin(vestidosTable, eq(vestidosTable.id, lookbookItensTable.vestidoId))
    .where(inArray(lookbookItensTable.lookbookId, lookbooks.map((l) => l.id)))
    .orderBy(asc(lookbookItensTable.ordem));

  return lookbooks.map((l) => ({
    id: l.id,
    leadId: l.leadId,
    token: l.token,
    expiraEm: l.expiraEm,
    criadoEm: l.createdAt,
    vestidos: itens
      .filter((i) => i.lookbookId === l.id)
      .map((i) => ({ vestidoId: i.vestidoId, nome: i.nome })),
  }));
}

router.get("/lojas/:lojaId/lookbooks", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ListLookbooksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  res.json(ListLookbooksResponse.parse(await listarDaNoiva(lojaId, parsed.data.leadId)));
});

router.post("/lojas/:lojaId/lookbooks", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateLookbookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(erroDeValidacao(parsed.error));
    return;
  }
  const { leadId, vestidoIds } = parsed.data;
  const unicos = [...new Set(vestidoIds)];

  // Lead e vestidos precisam ser DESTA loja — o link nasce escopado.
  const [okLead, vestidosDaLoja] = await Promise.all([
    leadNaLoja(leadId, lojaId),
    db.select({ id: vestidosTable.id }).from(vestidosTable)
      .where(and(eq(vestidosTable.lojaId, lojaId), inArray(vestidosTable.id, unicos))),
  ]);
  if (!okLead || vestidosDaLoja.length !== unicos.length) {
    res.status(422).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead ou vestidos não são desta loja" });
    return;
  }

  const id = randomUUID();
  const token = gerarTokenConvite();
  await db.transaction(async (tx) => {
    await tx.insert(lookbooksTable).values({
      id,
      lojaId,
      leadId,
      token,
      criadoPorId: req.usuario!.id,
      expiraEm: new Date(Date.now() + LOOKBOOK_TTL_MS),
    });
    await tx.insert(lookbookItensTable).values(
      unicos.map((vestidoId, ordem) => ({ id: randomUUID(), lookbookId: id, vestidoId, ordem })),
    );
  });

  const [criado] = await listarDaNoiva(lojaId, leadId).then((ls) => ls.filter((l) => l.id === id));
  res.status(201).json(CreateLookbookResponse.parse(criado));
});

router.delete("/lojas/:lojaId/lookbooks/:lookbookId", async (req, res): Promise<void> => {
  const { lojaId, lookbookId } = req.params;
  await db.delete(lookbooksTable)
    .where(and(eq(lookbooksTable.id, lookbookId as string), eq(lookbooksTable.lojaId, lojaId as string)));
  res.status(204).send();
});

export default router;
