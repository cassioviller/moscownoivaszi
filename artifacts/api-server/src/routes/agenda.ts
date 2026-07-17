import { Router, type IRouter } from "express";
import { db, cabinesTable, atendimentosTable, ajustesTable, ajusteChecklistItensTable, regraDisponibilidadeTable } from "@workspace/db";
import { eq, and, max } from "drizzle-orm";
import { leadNaLoja, cabineNaLoja, vendedoraNaLoja } from "../lib/escopo-loja";
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
  AddChecklistItemBody,
  AddChecklistItemResponse,
  UpdateChecklistItemBody,
  UpdateChecklistItemResponse,
  GetDisponibilidadeResponse,
  SetDisponibilidadeBody,
  SetDisponibilidadeResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

// Joins padrão dos atendimentos: as telas de fila/agenda/provas precisam de
// noiva, cabine, vendedora e — nas provas — vestido via bloqueio + ajustes
// com checklist. Os schemas de resposta expõem essas relações.
const ATENDIMENTO_WITH = {
  lead: true,
  cabine: true,
  vendedora: true,
  bloqueio: { with: { vestido: true } },
  ajustes: {
    with: { checklist: { orderBy: (t: typeof ajusteChecklistItensTable, { asc }: any) => [asc(t.ordem)] } },
  },
} as const;

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/cabines", requireModulo("agenda"));
router.use("/lojas/:lojaId/atendimentos", requireModulo("agenda"));
router.use("/lojas/:lojaId/ajustes", requireModulo("agenda"));
router.use("/lojas/:lojaId/disponibilidade", requireModulo("agenda"));

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

router.patch("/lojas/:lojaId/cabines/:cabineId", async (req, res): Promise<void> => {
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
    .where(and(eq(cabinesTable.id, params.data.cabineId), eq(cabinesTable.lojaId, params.data.lojaId)))
    .returning();
  if (!cabine) {
    res.status(404).json({ error: "Cabine not found" });
    return;
  }
  res.json(UpdateCabineResponse.parse(cabine));
});

router.delete("/lojas/:lojaId/cabines/:cabineId", async (req, res): Promise<void> => {
  const params = DeleteCabineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(cabinesTable).where(and(eq(cabinesTable.id, params.data.cabineId), eq(cabinesTable.lojaId, params.data.lojaId)));
  res.status(204).send();
});

// Atendimentos
router.get("/lojas/:lojaId/atendimentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const atendimentos = await db.query.atendimentosTable.findMany({
    where: eq(atendimentosTable.lojaId, lojaId),
    with: ATENDIMENTO_WITH,
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

  // As FKs vêm do corpo: garantir que lead, cabine e vendedora são DESTA loja,
  // senão o atendimento nasce referenciando outra (vazamento de tenant).
  const [okLead, okCabine, okVend] = await Promise.all([
    leadNaLoja(parsed.data.leadId, lojaId),
    cabineNaLoja(parsed.data.cabineId, lojaId),
    vendedoraNaLoja(parsed.data.vendedoraId, lojaId),
  ]);
  if (!okLead || !okCabine || !okVend) {
    res.status(404).json({ error: "REFERENCIA_INVALIDA", detalhe: "lead, cabine ou vendedora não são desta loja" });
    return;
  }

  const [atendimento] = await db.insert(atendimentosTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
  }).returning();
  
  const fullAtendimento = await db.query.atendimentosTable.findFirst({
    where: eq(atendimentosTable.id, atendimento.id),
    with: ATENDIMENTO_WITH,
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
    with: ATENDIMENTO_WITH,
  });

  res.json(UpdateAtendimentoResponse.parse(fullAtendimento));
});

router.delete("/lojas/:lojaId/atendimentos/:atendimentoId", async (req, res): Promise<void> => {
  const { lojaId, atendimentoId } = req.params;
  await db.delete(atendimentosTable).where(and(eq(atendimentosTable.id, atendimentoId as string), eq(atendimentosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Ajustes
// Contexto relacional da fila da costureira: ajuste → atendimento →
// bloqueio → {noiva, vestido, casamentoData} + checklist ordenado.
const AJUSTE_WITH = {
  checklist: { orderBy: (t: typeof ajusteChecklistItensTable, { asc }: any) => [asc(t.ordem)] },
  atendimento: { with: { lead: true, bloqueio: { with: { vestido: true } } } },
} as const;

router.get("/lojas/:lojaId/ajustes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const ajustes = await db.query.ajustesTable.findMany({
    where: eq(ajustesTable.lojaId, lojaId),
    with: AJUSTE_WITH,
  });
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
  const fullAjuste = await db.query.ajustesTable.findFirst({
    where: eq(ajustesTable.id, ajuste.id),
    with: AJUSTE_WITH,
  });
  res.status(201).json(CreateAjusteResponse.parse(fullAjuste));
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
  const fullAjuste = await db.query.ajustesTable.findFirst({
    where: eq(ajustesTable.id, ajuste.id),
    with: AJUSTE_WITH,
  });
  res.json(UpdateAjusteResponse.parse(fullAjuste));
});

router.delete("/lojas/:lojaId/ajustes/:ajusteId", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params;
  await db.delete(ajustesTable).where(and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Checklist de costura (sub-recurso do ajuste). A tabela não tem lojaId —
// o escopo de loja vem sempre do ajuste pai.
router.post("/lojas/:lojaId/ajustes/:ajusteId/checklist", async (req, res): Promise<void> => {
  const { lojaId, ajusteId } = req.params;
  const parsed = AddChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ajuste = await db.query.ajustesTable.findFirst({
    where: and(eq(ajustesTable.id, ajusteId as string), eq(ajustesTable.lojaId, lojaId as string)),
  });
  if (!ajuste) {
    res.status(404).json({ error: "Ajuste not found" });
    return;
  }

  let ordem = parsed.data.ordem;
  if (ordem === undefined) {
    const [{ maxOrdem }] = await db
      .select({ maxOrdem: max(ajusteChecklistItensTable.ordem) })
      .from(ajusteChecklistItensTable)
      .where(eq(ajusteChecklistItensTable.ajusteId, ajuste.id));
    ordem = (maxOrdem ?? -1) + 1;
  }

  const [item] = await db.insert(ajusteChecklistItensTable).values({
    id: randomUUID(),
    ajusteId: ajuste.id,
    descricao: parsed.data.descricao,
    ordem,
  }).returning();

  res.status(201).json(AddChecklistItemResponse.parse(item));
});

/** Carrega o item confirmando que o ajuste pai pertence à loja da URL. */
async function itemChecklistDaLoja(itemId: string, lojaId: string) {
  const item = await db.query.ajusteChecklistItensTable.findFirst({
    where: eq(ajusteChecklistItensTable.id, itemId),
    with: { ajuste: true },
  });
  if (!item || item.ajuste.lojaId !== lojaId) return null;
  return item;
}

router.patch("/lojas/:lojaId/ajustes/checklist/:itemId", async (req, res): Promise<void> => {
  const { lojaId, itemId } = req.params;
  const parsed = UpdateChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existente = await itemChecklistDaLoja(itemId as string, lojaId as string);
  if (!existente) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const [item] = await db.update(ajusteChecklistItensTable)
    .set(parsed.data)
    .where(eq(ajusteChecklistItensTable.id, existente.id))
    .returning();

  res.json(UpdateChecklistItemResponse.parse(item));
});

router.delete("/lojas/:lojaId/ajustes/checklist/:itemId", async (req, res): Promise<void> => {
  const { lojaId, itemId } = req.params;
  const existente = await itemChecklistDaLoja(itemId as string, lojaId as string);
  if (!existente) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  await db.delete(ajusteChecklistItensTable).where(eq(ajusteChecklistItensTable.id, existente.id));
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
