import { Router, type IRouter } from "express";
import { db, cabinesTable, atendimentosTable, ajustesTable, regraDisponibilidadeTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListCabinesResponse,
  CreateCabineBody,
  CreateCabineResponse,
  UpdateCabineParams,
  UpdateCabineBody,
  UpdateCabineResponse,
  DeleteCabineParams,
  ListAtendimentosResponse,
  CreateAtendimentoBody,
  CreateAtendimentoResponse,
  UpdateAtendimentoParams,
  UpdateAtendimentoBody,
  UpdateAtendimentoResponse,
  DeleteAtendimentoParams,
  ListAjustesResponse,
  CreateAjusteBody,
  CreateAjusteResponse,
  UpdateAjusteBody,
  UpdateAjusteResponse,
  GetDisponibilidadeResponse,
  SetDisponibilidadeBody,
  SetDisponibilidadeResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

// Cabines
router.get("/lojas/:lojaId/cabines", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const cabines = await db.select().from(cabinesTable).where(eq(cabinesTable.lojaId, lojaId)).orderBy(cabinesTable.nome);
  res.json(ListCabinesResponse.parse(cabines));
});

router.post("/lojas/:lojaId/cabines", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateCabineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cabine] = await db.insert(cabinesTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  res.status(201).json(CreateCabineResponse.parse(cabine));
});

router.patch("/cabines/:cabineId", async (req, res): Promise<void> => {
  const params = UpdateCabineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCabineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cabine] = await db.update(cabinesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(cabinesTable.id, params.data.cabineId))
    .returning();
  if (!cabine) {
    res.status(404).json({ error: "Cabine not found" });
    return;
  }
  res.json(UpdateCabineResponse.parse(cabine));
});

router.delete("/cabines/:cabineId", async (req, res): Promise<void> => {
  const params = DeleteCabineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(cabinesTable).where(eq(cabinesTable.id, params.data.cabineId));
  res.status(204).send();
});

// Atendimentos
router.get("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const atendimentos = await db.query.atendimentosTable.findMany({
    where: eq(atendimentosTable.lojaId, lojaId),
    with: {
      lead: true,
      cabine: true,
      vendedora: true,
    },
    orderBy: atendimentosTable.inicio,
  });
  res.json(ListAtendimentosResponse.parse(atendimentos));
});

router.post("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateAtendimentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const [atendimento] = await db.insert(atendimentosTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  
  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimento.id),
    with: { lead: true, cabine: true, vendedora: true }
  });
  
  res.status(201).json(CreateAtendimentoResponse.parse(fullAtendimento));
});

router.patch("/lojas/:lojaId/atendimentos/:atendimentoId", async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params;
  const parsed = UpdateAtendimentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const [atendimento] = await db.update(atendimentosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(atendimentosTable.id, atendimentoId as string), eq(atendimentosTable.lojaId, lojaId as string)))
    .returning();
    
  if (!atendimento) {
    res.status(404).json({ error: "Atendimento not found" });
    return;
  }
  
  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimento.id),
    with: { lead: true, cabine: true, vendedora: true }
  });
  
  res.json(UpdateAtendimentoResponse.parse(fullAtendimento));
});

router.delete("/lojas/:lojaId/atendimentos/:atendimentoId", async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params;
  await db.delete(atendimentosTable).where(and(eq(atendimentosTable.id, atendimentoId as string), eq(atendimentosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Ajustes
router.get("/lojas/:lojaId/ajustes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const ajustes = await db.select().from(ajustesTable).where(eq(ajustesTable.lojaId, lojaId));
  res.json(ListAjustesResponse.parse(ajustes));
});

router.post("/lojas/:lojaId/ajustes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateAjusteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  // @ts-ignore
  const { atendimentoId, ...ajusteData } = parsed.data;

  const [ajuste] = await db.insert(ajustesTable).values({
    id: randomUUID(),
    lojaId,
    atendimentoId: (atendimentoId as string),
    ...ajusteData,
  }).returning();
  res.status(201).json(CreateAjusteResponse.parse(ajuste));
});

router.patch("/lojas/:lojaId/ajustes/:ajusteId", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params;
  const parsed = UpdateAjusteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [ajuste] = await db.update(ajustesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)))
    .returning();
  if (!ajuste) {
    res.status(404).json({ error: "Ajuste not found" });
    return;
  }
  res.json(UpdateAjusteResponse.parse(ajuste));
});

router.delete("/lojas/:lojaId/ajustes/:ajusteId", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params;
  await db.delete(ajustesTable).where(and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Disponibilidade (Regras)
router.get("/lojas/:lojaId/disponibilidade/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const regra = await db.query.regraDisponibilidadeTable.findFirst({
    where: eq(regraDisponibilidadeTable.lojaId, lojaId),
  });
  if (!regra) {
    res.status(404).json({ error: "Regra not found" });
    return;
  }
  res.json(GetDisponibilidadeResponse.parse(regra));
});

router.put("/lojas/:lojaId/disponibilidade/regras", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = SetDisponibilidadeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [regra] = await db.insert(regraDisponibilidadeTable)
    .values({
      id: randomUUID(),
      lojaId,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: regraDisponibilidadeTable.lojaId,
      set: parsed.data,
    })
    .returning();

  res.json(SetDisponibilidadeResponse.parse(regra));
});

export default router;
