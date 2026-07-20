import { Router, type IRouter } from "express";
import { db, lojasTable, leadsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CaptarLeadQueryParams,
  CaptarLeadBody,
  CaptarLeadResponse,
  GetCaptacaoTokenResponse,
  RotacionarCaptacaoTokenResponse,
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { gerarTokenConvite } from "../lib/auth";
import { randomUUID } from "node:crypto";

/**
 * Captação externa (E19): o formulário do site/Instagram cria o lead sozinho —
 * hoje todo lead nasce digitado à mão. O token por loja (256 bits, mesmo
 * formato do convite E6) é a credencial; em QUERY, nunca no path: o pino-http
 * corta a query e o token não cai em log.
 *
 * O POST público vive aqui e o arquivo é montado ANTES dos routers de domínio
 * (que aplicam requireSessaoComLoja sem path). A gestão do token fica no mesmo
 * arquivo, mas atrás de sessão + gate admin.
 */
const router: IRouter = Router();

router.post("/captacao/leads", async (req, res): Promise<void> => {
  const query = CaptarLeadQueryParams.safeParse(req.query);
  const body = CaptarLeadBody.safeParse(req.body);
  if (!query.success || !body.success) {
    res.status(400).json({ error: "DADOS_INVALIDOS" });
    return;
  }

  const [loja] = await db
    .select({ id: lojasTable.id, ativo: lojasTable.ativo })
    .from(lojasTable)
    .where(eq(lojasTable.captacaoToken, query.data.token));
  // Loja inativa responde igual a token desconhecido: a captação de uma loja
  // desligada não é um estado que o formulário público precise distinguir.
  if (!loja || !loja.ativo) {
    res.status(404).json({ error: "CAPTACAO_INVALIDA" });
    return;
  }

  const { noivaNome, noivoNome, whatsapp, casamentoData, origem } = body.data;
  const [lead] = await db.insert(leadsTable).values({
    id: randomUUID(),
    lojaId: loja.id,
    noivaNome: noivaNome.trim(),
    noivoNome: noivoNome?.trim() || null,
    whatsapp: whatsapp?.trim() || null,
    casamentoData: casamentoData ?? null,
    origem: origem ?? "SITE",
  }).returning({ id: leadsTable.id });

  req.log.info({ leadId: lead.id, lojaId: loja.id, origem: origem ?? "SITE" }, "lead_captado");
  res.status(201).json(CaptarLeadResponse.parse(lead));
});

// ── Gestão do token (sessão + admin) ──
router.use("/lojas/:lojaId/captacao", requireSessaoComLoja, requireModulo("admin"));

router.get("/lojas/:lojaId/captacao/token", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const [loja] = await db
    .select({ token: lojasTable.captacaoToken })
    .from(lojasTable)
    .where(eq(lojasTable.id, lojaId));
  res.json(GetCaptacaoTokenResponse.parse({ token: loja?.token ?? null }));
});

router.post("/lojas/:lojaId/captacao/token", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const token = gerarTokenConvite();
  const [loja] = await db
    .update(lojasTable)
    .set({ captacaoToken: token, updatedAt: new Date() })
    .where(and(eq(lojasTable.id, lojaId), eq(lojasTable.ativo, true)))
    .returning({ token: lojasTable.captacaoToken });
  if (!loja) {
    res.status(404).json({ error: "Loja not found" });
    return;
  }
  req.log.info({ lojaId }, "captacao_token_rotacionado");
  res.json(RotacionarCaptacaoTokenResponse.parse({ token: loja.token }));
});

export default router;
