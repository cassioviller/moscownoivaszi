import { Router, type IRouter } from "express";
import { db, orcamentosTable, orcamentoItensTable, leadsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListOrcamentosResponse,
  CreateOrcamentoBody,
  CreateOrcamentoResponse,
  GetOrcamentoResponse,
  UpdateOrcamentoBody,
  UpdateOrcamentoResponse,
  DeleteOrcamentoResponse,
  AddOrcamentoItemBody,
  AddOrcamentoItemResponse,
  UpdateOrcamentoItemBody,
  UpdateOrcamentoItemResponse,
  RemoveOrcamentoItemResponse,
  CriarLinkOrcamentoResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";
import { gerarTokenConvite, CONVITE_TTL_MS } from "../lib/auth";
import { avancarEtapaLead, transicaoOrcamentoValida } from "../lib/estados";

const router: IRouter = Router();

/** Avança o lead para ORCAMENTO_ABERTO (só se for à frente no funil). */
async function marcarOrcamentoAberto(lojaId: string, leadId: string): Promise<void> {
  const lead = await db.query.leadsTable.findFirst({
    where: and(eq(leadsTable.id, leadId), eq(leadsTable.lojaId, lojaId)),
  });
  if (!lead) return;
  const nova = avancarEtapaLead(lead.etapa, "ORCAMENTO_ABERTO");
  if (nova === lead.etapa) return;
  await db.update(leadsTable)
    .set({ etapa: nova, orcamentoAbertoEm: lead.orcamentoAbertoEm ?? new Date(), updatedAt: new Date() })
    .where(eq(leadsTable.id, lead.id));
}

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/orcamentos", requireModulo("leads"));

router.get("/lojas/:lojaId/orcamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentos = await db.query.orcamentosTable.findMany({
    where: eq(orcamentosTable.lojaId, lojaId),
    with: {
      lead: true,
      vendedora: true,
      itens: true
    },
    orderBy: orcamentosTable.createdAt,
  });
  res.json(ListOrcamentosResponse.parse(orcamentos));
});

router.post("/lojas/:lojaId/orcamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateOrcamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  // Quem abriu vem da SESSÃO, nunca do corpo: aceitar um `vendedoraId` do
  // cliente deixava atribuir o orçamento (e a comissão que nasce dele) a
  // outra pessoa — mesma regra do vendedorId da cobrança.
  const [orcamento] = await db.insert(orcamentosTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
    vendedoraId: req.usuario!.id,
  }).returning();

  // Abrir um orçamento avança o funil do lead (evento de negócio).
  await marcarOrcamentoAberto(lojaId, orcamento.leadId);

  const fullOrcamento = await db.query.orcamentosTable.findFirst({
    where: eq(orcamentosTable.id, orcamento.id),
    with: { lead: true, vendedora: true, itens: true }
  });
  res.status(201).json(CreateOrcamentoResponse.parse(fullOrcamento));
});

router.get("/lojas/:lojaId/orcamentos/:orcamentoId", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)),
    with: {
      lead: true,
      vendedora: true,
      itens: true
    },
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  res.json(GetOrcamentoResponse.parse(orcamento));
});

router.patch("/lojas/:lojaId/orcamentos/:orcamentoId", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params;
  const parsed = UpdateOrcamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const existente = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)),
  });
  if (!existente) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }

  // Mudança de status via PATCH também passa pela máquina de estados.
  if (parsed.data.status && !transicaoOrcamentoValida(existente.status, parsed.data.status)) {
    res.status(422).json({
      error: "TRANSICAO_INVALIDA",
      detalhe: `Orçamento não pode ir de ${existente.status} para ${parsed.data.status}`,
    });
    return;
  }

  const virandoAprovado = parsed.data.status === "APROVADO" && existente.status !== "APROVADO";
  const [orcamento] = await db.update(orcamentosTable)
    .set({
      ...parsed.data,
      ...(virandoAprovado ? { aprovadoEm: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)))
    .returning();
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  const fullOrcamento = await db.query.orcamentosTable.findFirst({
    where: eq(orcamentosTable.id, orcamento.id),
    with: { lead: true, vendedora: true, itens: true }
  });
  res.json(UpdateOrcamentoResponse.parse(fullOrcamento));
});

router.delete("/lojas/:lojaId/orcamentos/:orcamentoId", async (req, res): Promise<void> => {
  const { lojaId, orcamentoId } = req.params;
  await db.delete(orcamentosTable).where(and(eq(orcamentosTable.id, orcamentoId as string), eq(orcamentosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/itens", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const parsed = AddOrcamentoItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const orcamento = await db.query.orcamentosTable.findFirst({ where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)) });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }

  const [item] = await db.insert(orcamentoItensTable).values({
    id: randomUUID(),
    lojaId: orcamento.lojaId,
    orcamentoId,
    ...parsed.data,
  }).returning();

  res.status(201).json(AddOrcamentoItemResponse.parse(item));
});

router.patch("/lojas/:lojaId/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itemId = req.params.itemId as string;
  const parsed = UpdateOrcamentoItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.update(orcamentoItensTable)
    .set(parsed.data)
    .where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(UpdateOrcamentoItemResponse.parse(item));
});

router.delete("/lojas/:lojaId/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const itemId = req.params.itemId as string;
  await db.delete(orcamentoItensTable).where(and(eq(orcamentoItensTable.id, itemId), eq(orcamentoItensTable.lojaId, lojaId)));
  res.status(204).send();
});

/**
 * Link público (E13): gera/regenera o token de leitura da noiva. Token novo
 * mata o anterior (coluna única, mesmo modelo do reenvio de convite E6) e a
 * validade recomeça. Gerar link de um RASCUNHO marca ENVIADO — compartilhar
 * É enviar; RECUSADO não gera (não há o que a noiva rever de um não).
 */
router.post("/lojas/:lojaId/orcamentos/:orcamentoId/link", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  if (orcamento.status === "RECUSADO") {
    res.status(422).json({ error: "ORCAMENTO_RECUSADO", detalhe: "Orçamento recusado não gera link" });
    return;
  }

  const token = gerarTokenConvite();
  const expiraEm = new Date(Date.now() + CONVITE_TTL_MS);
  await db.update(orcamentosTable)
    .set({
      publicoToken: token,
      publicoExpiraEm: expiraEm,
      ...(orcamento.status === "RASCUNHO" ? { status: "ENVIADO" as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(orcamentosTable.id, orcamento.id));

  res.json(CriarLinkOrcamentoResponse.parse({ token, expiraEm }));
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/aprovar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  if (orcamento.status === "APROVADO" || orcamento.status === "RECUSADO") {
    res.status(422).json({ error: "TRANSICAO_INVALIDA", detalhe: `Orçamento já está ${orcamento.status}` });
    return;
  }

  // Aprovar NÃO mexe na etapa do lead — o funil só avança para
  // CONTRATO_FECHADO quando um contrato é efetivamente fechado.
  await db.update(orcamentosTable)
    .set({ status: "APROVADO", aprovadoEm: new Date(), updatedAt: new Date() })
    .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)));

  res.status(204).send();
});

router.post("/lojas/:lojaId/orcamentos/:orcamentoId/recusar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const orcamentoId = req.params.orcamentoId as string;
  const orcamento = await db.query.orcamentosTable.findFirst({
    where: and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
  });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  if (orcamento.status === "APROVADO" || orcamento.status === "RECUSADO") {
    res.status(422).json({ error: "TRANSICAO_INVALIDA", detalhe: `Orçamento já está ${orcamento.status}` });
    return;
  }

  await db.update(orcamentosTable)
    .set({ status: "RECUSADO", updatedAt: new Date() })
    .where(and(eq(orcamentosTable.id, orcamentoId), eq(orcamentosTable.lojaId, lojaId)));

  res.status(204).send();
});

export default router;
