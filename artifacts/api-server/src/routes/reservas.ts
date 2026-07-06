import { Router, type IRouter } from "express";
import { db, reservasTable, bloqueioVestidosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListReservasResponse,
  CreateReservaBody,
  CreateReservaResponse,
  UpdateReservaBody,
  UpdateReservaResponse,
  ListBloqueiosResponse,
  CreateBloqueioBody,
  CreateBloqueioResponse,
  UpdateBloqueioBody,
  UpdateBloqueioResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

// Reservas
router.get("/lojas/:lojaId/reservas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const reservas = await db.query.reservasTable.findMany({
    where: eq(reservasTable.lojaId, lojaId),
    with: {
      lead: true,
      bloqueios: true,
    },
    orderBy: reservasTable.casamentoData,
  });
  res.json(ListReservasResponse.parse(reservas));
});

router.post("/lojas/:lojaId/reservas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [reserva] = await db.insert(reservasTable).values({
    id: randomUUID(),
    lojaId,
    // @ts-ignore
    ...parsed.data,
  }).returning();
  
  const fullReserva = await db.query.reservasTable.findFirst({
    where: eq(reservasTable.id, reserva.id),
    with: { lead: true, bloqueios: true }
  });
  res.status(201).json(CreateReservaResponse.parse(fullReserva));
});

router.patch("/lojas/:lojaId/reservas/:reservaId", async (req, res): Promise<void> => {
  const { lojaId, reservaId } = req.params;
  const parsed = UpdateReservaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const updateData = { ...parsed.data, updatedAt: new Date() };

  const [reserva] = await db.update(reservasTable)
    .set(updateData as any)
    .where(and(eq(reservasTable.id, reservaId as string), eq(reservasTable.lojaId, lojaId as string)))
    .returning();
  if (!reserva) {
    res.status(404).json({ error: "Reserva not found" });
    return;
  }
  const fullReserva = await db.query.reservasTable.findFirst({
    where: eq(reservasTable.id, reserva.id),
    with: { lead: true, bloqueios: true }
  });
  res.json(UpdateReservaResponse.parse(fullReserva));
});

router.delete("/lojas/:lojaId/reservas/:reservaId", async (req, res): Promise<void> => {
  const { lojaId, reservaId } = req.params;
  await db.delete(reservasTable).where(and(eq(reservasTable.id, reservaId as string), eq(reservasTable.lojaId, lojaId as string)));
  res.status(204).send();
});

// Bloqueios
router.get("/lojas/:lojaId/bloqueios", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const bloqueios = await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.lojaId, lojaId));
  res.json(ListBloqueiosResponse.parse(bloqueios));
});

router.post("/lojas/:lojaId/bloqueios", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateBloqueioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [bloqueio] = await db.insert(bloqueioVestidosTable).values({
    id: randomUUID(),
    lojaId,
    // @ts-ignore
    ...parsed.data,
  } as any).returning();
  res.status(201).json(CreateBloqueioResponse.parse(bloqueio));
});

router.patch("/lojas/:lojaId/bloqueios/:bloqueioId", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params;
  const parsed = UpdateBloqueioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const updateData = { ...parsed.data, updatedAt: new Date() };

  const [bloqueio] = await db.update(bloqueioVestidosTable)
    .set(updateData as any)
    .where(and(eq(bloqueioVestidosTable.id, bloqueioId as string), eq(bloqueioVestidosTable.lojaId, lojaId as string)))
    .returning();
  if (!bloqueio) {
    res.status(404).json({ error: "Bloqueio not found" });
    return;
  }
  res.json(UpdateBloqueioResponse.parse(bloqueio));
});

router.delete("/lojas/:lojaId/bloqueios/:bloqueioId", async (req, res): Promise<void> => {
  const { lojaId, bloqueioId } = req.params;
  await db.delete(bloqueioVestidosTable).where(and(eq(bloqueioVestidosTable.id, bloqueioId as string), eq(bloqueioVestidosTable.lojaId, lojaId as string)));
  res.status(204).send();
});

export default router;
