import { Router, type IRouter } from "express";
import { db, parcelasTable, contasPagarTable, salariosRecorrentesTable, saldosReferenciaTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { 
  ReceberParcelaBody,
  ReceberParcelaResponse,
  PagarContaPagarBody as PagarPagarContaBody,
  PagarContaPagarResponse,
  CreateSalarioRecorrenteBody,
  UpdateSalarioRecorrenteBody,
  CreateSaldoReferenciaBody,
  ListParcelasResponse,
  ListContasPagarResponse,
  CreateContaPagarBody,
  CreateContaPagarResponse,
  ListSalariosRecorrentesResponse,
  CreateSalarioRecorrenteResponse,
  UpdateSalarioRecorrenteResponse,
  ListSaldoReferenciaResponse,
  CreateSaldoReferenciaResponse
} from "@workspace/api-zod";
import { requireSessaoComLoja } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);

router.get("/lojas/:lojaId/financeiro/parcelas", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parcelas = await db.query.parcelasTable.findMany({
    where: eq(parcelasTable.lojaId, lojaId),
    with: { contrato: { with: { lead: true } } },
    orderBy: parcelasTable.vencimento,
  });
  res.json(ListParcelasResponse.parse(parcelas));
});

router.post("/lojas/:lojaId/financeiro/contas-pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateContaPagarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conta] = await db.insert(contasPagarTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
    vencimento: new Date(parsed.data.vencimento),
  } as any).returning();
  res.status(201).json(CreateContaPagarResponse.parse(conta));
});

router.get("/lojas/:lojaId/financeiro/contas-pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contas = await db.select().from(contasPagarTable).where(eq(contasPagarTable.lojaId, lojaId)).orderBy(contasPagarTable.vencimento);
  res.json(ListContasPagarResponse.parse(contas));
});

router.post("/contas-pagar/:contaId/pagar", async (req, res): Promise<void> => {
  const contaId = req.params.contaId as string;
  const parsed = PagarPagarContaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conta] = await db.update(contasPagarTable)
    .set({ 
      status: "PAGA", 
      pagamentoEfetuadoEm: new Date(),
      valorPago: parsed.data.valorPago,
      updatedAt: new Date() 
    } as any)
    .where(eq(contasPagarTable.id, contaId))
    .returning();

  if (!conta) {
    res.status(404).json({ error: "Conta not found" });
    return;
  }
  res.json(PagarContaPagarResponse.parse(conta));
});

router.get("/lojas/:lojaId/financeiro/salarios-recorrentes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const salarios = await db.select().from(salariosRecorrentesTable).where(eq(salariosRecorrentesTable.lojaId, lojaId));
  res.json(ListSalariosRecorrentesResponse.parse(salarios));
});

router.post("/lojas/:lojaId/financeiro/salarios-recorrentes", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateSalarioRecorrenteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [salario] = await db.insert(salariosRecorrentesTable).values({
    id: randomUUID(),
    lojaId,
    ...parsed.data,
    // @ts-ignore
    valorMensal: parsed.data.valorMensal.toString(),
  } as any).returning();
  res.status(201).json(CreateSalarioRecorrenteResponse.parse(salario));
});

router.patch("/financeiro/salarios-recorrentes/:salarioId", async (req, res): Promise<void> => {
  const salarioId = req.params.salarioId as string;
  const parsed = UpdateSalarioRecorrenteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const updateData = { ...parsed.data, updatedAt: new Date() };
  // @ts-ignore
  if (updateData.valorMensal) updateData.valorMensal = updateData.valorMensal.toString();

  const [salario] = await db.update(salariosRecorrentesTable)
    .set(updateData as any)
    .where(eq(salariosRecorrentesTable.id, salarioId))
    .returning();
  if (!salario) {
    res.status(404).json({ error: "Salario not found" });
    return;
  }
  res.json(UpdateSalarioRecorrenteResponse.parse(salario));
});

router.get("/lojas/:lojaId/financeiro/saldos-referencia", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const saldos = await db.select().from(saldosReferenciaTable).where(eq(saldosReferenciaTable.lojaId, lojaId));
  res.json(ListSaldoReferenciaResponse.parse(saldos));
});

router.post("/lojas/:lojaId/financeiro/saldos-referencia", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreateSaldoReferenciaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [saldo] = await db.insert(saldosReferenciaTable)
    .values({
      id: randomUUID(),
      lojaId,
      ...parsed.data,
    } as any)
    .onConflictDoUpdate({
      target: [saldosReferenciaTable.lojaId, saldosReferenciaTable.competencia],
      set: { 
        valor: parsed.data.valor,
      } as any,
    })
    .returning();
  res.json(CreateSaldoReferenciaResponse.parse(saldo));
});

export default router;
