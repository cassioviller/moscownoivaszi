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
import { whatsappUtilizavel } from "@workspace/funil-core";
import { reancorarDataDeNegocio } from "@workspace/financeiro-core";

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

  const { noivaNome, noivoNome, whatsapp, casamentoData, origem, consentimento } = body.data;

  /**
   * S-O44 — **aqui o número torto ENTRA, e é decisão, não esquecimento.**
   *
   * A porta da loja (`leads.ts`) recusa o WhatsApp que não vira link: quem
   * digita está com a noiva na frente e corrige na hora. **Aqui não há
   * ninguém.** A noiva preenche o formulário do site, erra um dígito, e
   * recusar custaria o CONTATO INTEIRO em vez de um botão — a loja perde a
   * venda para não perder um link.
   *
   * Então aceita, grava, e **a ficha se marca sozinha**: `whatsappUtilizavel` é
   * derivada do número (`funil-core`), e o selo *"Este número não abre o
   * WhatsApp"* aparece nas quatro filas de mensagem, com o caminho para
   * corrigir. Sem coluna nova, sem estado para desincronizar — a mesma decisão
   * que a S-O5 tomou para a prova órfã.
   *
   * O log fica porque é o único lugar onde se pode CONTAR: se a captação
   * começar a trazer muitos números tortos, o problema é a máscara do
   * formulário do site, e é isto aqui que vai dizer.
   */
  if (!whatsappUtilizavel(whatsapp)) {
    req.log.info(
      { lojaId: loja.id, origem: origem ?? "SITE" },
      "captacao_whatsapp_nao_abre",
    );
  }
  const [lead] = await db.insert(leadsTable).values({
    id: randomUUID(),
    lojaId: loja.id,
    noivaNome: noivaNome.trim(),
    noivoNome: noivoNome?.trim() || null,
    whatsapp: whatsapp?.trim() || null,
    // S-O117: é a porta MENOS controlada do sistema — quem posta aqui é o
    // formulário do site, e nada garante que ele ancore o dia como a tela da
    // loja ancora. A âncora é do servidor.
    casamentoData: casamentoData ? reancorarDataDeNegocio(casamentoData) : null,
    origem: origem ?? "SITE",
    // E77: o checkbox do formulário vira carimbo — quando ELA consentiu.
    consentimentoEm: consentimento ? new Date() : null,
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
    res.status(404).json({ error: "LOJA_NAO_ENCONTRADA", detalhe: "Esta loja não existe." });
    return;
  }
  req.log.info({ lojaId }, "captacao_token_rotacionado");
  res.json(RotacionarCaptacaoTokenResponse.parse({ token: loja.token }));
});

export default router;
