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
  RemoveOrcamentoItemResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

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
  
  const insertData = { ...parsed.data };
  // @ts-ignore
  if (insertData.validade) insertData.validade = new Date(insertData.validade);

  const [orcamento] = await db.insert(orcamentosTable).values({
    id: randomUUID(),
    lojaId,
    // @ts-ignore
    vendedoraId: req.usuario!.id,
    ...insertData,
  } as any).returning();

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
  
  const updateData = { ...parsed.data, updatedAt: new Date() };
  // @ts-ignore
  if (updateData.validade) updateData.validade = new Date(updateData.validade);

  const [orcamento] = await db.update(orcamentosTable)
    .set(updateData as any)
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

router.post("/orcamentos/:orcamentoId/itens", async (req, res): Promise<void> => {
  const orcamentoId = req.params.orcamentoId as string;
  const parsed = AddOrcamentoItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const orcamento = await db.query.orcamentosTable.findFirst({ where: eq(orcamentosTable.id, orcamentoId) });
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }

  const [item] = await db.insert(orcamentoItensTable).values({
    id: randomUUID(),
    lojaId: orcamento.lojaId,
    orcamentoId,
    ...parsed.data,
  } as any).returning();

  res.status(201).json(AddOrcamentoItemResponse.parse(item));
});

router.delete("/orcamentos/itens/:itemId", async (req, res): Promise<void> => {
  const itemId = req.params.itemId as string;
  await db.delete(orcamentoItensTable).where(eq(orcamentoItensTable.id, itemId));
  res.status(204).send();
});

router.post("/orcamentos/:orcamentoId/aprovar", async (req, res): Promise<void> => {
  const orcamentoId = req.params.orcamentoId as string;
  const [orcamento] = await db.update(orcamentosTable)
    .set({ status: "APROVADO", aprovadoEm: new Date(), updatedAt: new Date() })
    .where(eq(orcamentosTable.id, orcamentoId))
    .returning();
  
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }

  await db.update(leadsTable)
    .set({ etapa: "ORCAMENTO_ABERTO", orcamentoAbertoEm: new Date(), updatedAt: new Date() })
    .where(eq(leadsTable.id, orcamento.leadId));

  res.status(204).send();
});

router.post("/orcamentos/:orcamentoId/recusar", async (req, res): Promise<void> => {
  const orcamentoId = req.params.orcamentoId as string;
  const [orcamento] = await db.update(orcamentosTable)
    .set({ status: "RECUSADO", updatedAt: new Date() })
    .where(eq(orcamentosTable.id, orcamentoId))
    .returning();
  
  if (!orcamento) {
    res.status(404).json({ error: "Orcamento not found" });
    return;
  }
  res.status(204).send();
});

export default router;
