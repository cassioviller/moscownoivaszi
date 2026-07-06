import { Router, type IRouter } from "express";
import { db, contratosTable, parcelasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { 
  ListContratosResponse,
  CreateContratoBody,
  CreateContratoResponse,
  GetContratoResponse,
  UpdateContratoBody,
  UpdateContratoResponse,
  CancelarContratoBody,
  CancelarContratoResponse,
  ListParcelasResponse,
  ReceberParcelaBody,
  ReceberParcelaResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

router.get("/lojas/:lojaId/contratos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contratos = await db.query.contratosTable.findMany({
    where: eq(contratosTable.lojaId, lojaId),
    with: {
      lead: true,
      vendedora: true,
    },
    orderBy: contratosTable.fechadoEm,
  });
  res.json(ListContratosResponse.parse(contratos));
});

router.post("/lojas/:lojaId/contratos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { parcelas: parcelasInput, ...contratoData } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [contrato] = await tx.insert(contratosTable).values({
      id: randomUUID(),
      lojaId,
      // @ts-ignore
      vendedoraId: req.usuario!.id,
      ...contratoData,
      fechadoEm: new Date(),
    } as any).returning();

    if (parcelasInput && parcelasInput.length > 0) {
      await tx.insert(parcelasTable).values(
        parcelasInput.map((p, idx) => ({
          id: randomUUID(),
          lojaId,
          contratoId: contrato.id,
          numero: idx + 1,
          descricao: `Parcela ${idx + 1}`,
          valorPrevisto: p.valorPrevisto,
          vencimento: new Date(p.vencimento),
          status: "PREVISTA" as const,
        } as any))
      );
    }

    return contrato;
  });

  const fullContrato = await db.query.contratosTable.findFirst({
    where: eq(contratosTable.id, result.id),
    with: { lead: true, vendedora: true, parcelas: true }
  });

  res.status(201).json(CreateContratoResponse.parse(fullContrato));
});

router.get("/lojas/:lojaId/contratos/:contratoId", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)),
    with: { lead: true, vendedora: true, parcelas: true }
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  res.json(GetContratoResponse.parse(contrato));
});

router.patch("/lojas/:lojaId/contratos/:contratoId", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const parsed = UpdateContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const updateData = { ...parsed.data, updatedAt: new Date() };

  const [contrato] = await db.update(contratosTable)
    .set(updateData as any)
    .where(and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)))
    .returning();

  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  res.json(UpdateContratoResponse.parse(contrato));
});

router.post("/lojas/:lojaId/contratos/:contratoId/cancelar", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const parsed = CancelarContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
    const [contrato] = await db.update(contratosTable)
      .set({ 
        status: "CANCELADO", 
        // @ts-ignore
        canceladoEm: new Date(), 
        // @ts-ignore
        canceladoMotivo: parsed.data.motivo,
        updatedAt: new Date() 
      })
    .where(and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)))
    .returning();
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  res.json(CancelarContratoResponse.parse(contrato));
});

// Parcelas
router.get("/lojas/:lojaId/contratos/:contratoId/parcelas", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const parcelas = await db.select().from(parcelasTable).where(and(eq(parcelasTable.contratoId, contratoId as string), eq(parcelasTable.lojaId, lojaId as string))).orderBy(parcelasTable.numero);
  res.json(ListParcelasResponse.parse(parcelas));
});

router.post("/parcelas/:parcelaId/receber", async (req, res): Promise<void> => {
  const { parcelaId } = req.params;
  const parsed = ReceberParcelaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [parcela] = await db.update(parcelasTable)
    .set({
      status: "PAGA",
      recebidoEm: new Date(),
      valorRecebido: parsed.data.valorRecebido,
      // @ts-ignore
      formaRecebimento: parsed.data.formaRecebimento,
      updatedAt: new Date()
    } as any)
    .where(eq(parcelasTable.id, parcelaId as string))
    .returning();
  if (!parcela) {
    res.status(404).json({ error: "Parcela not found" });
    return;
  }
  res.json(ReceberParcelaResponse.parse(parcela));
});

export default router;
