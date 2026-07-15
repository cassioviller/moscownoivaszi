import { Router, type IRouter } from "express";
import {
  db,
  parcelasTable,
  contasPagarTable,
  pagamentosTable,
  pagamentoItensTable,
  salariosRecorrentesTable,
  saldosReferenciaTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  PagarContaPagarBody,
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
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/financeiro", requireModulo("financeiro"));
router.use("/lojas/:lojaId/contas-pagar", requireModulo("financeiro"));

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
  }).returning();
  res.status(201).json(CreateContaPagarResponse.parse(conta));
});

router.get("/lojas/:lojaId/financeiro/contas-pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contas = await db.select().from(contasPagarTable).where(eq(contasPagarTable.lojaId, lojaId)).orderBy(contasPagarTable.vencimento);
  res.json(ListContasPagarResponse.parse(contas));
});

// Pagamento auditável: valor, data e forma persistem em pagamentos +
// pagamento_itens (contaPagarId é UNIQUE — cinto de segurança contra pagamento
// duplo no nível do banco); a conta só muda de status.
router.post("/lojas/:lojaId/contas-pagar/:contaId/pagar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contaId = req.params.contaId as string;
  const parsed = PagarContaPagarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conta] = await db.select().from(contasPagarTable)
    .where(and(eq(contasPagarTable.id, contaId), eq(contasPagarTable.lojaId, lojaId)));
  if (!conta) {
    res.status(404).json({ error: "Conta not found" });
    return;
  }
  if (conta.status === "PAGA") {
    res.status(409).json({ error: "CONTA_JA_PAGA", detalhe: "Esta conta já foi paga" });
    return;
  }

  const contaPaga = await db.transaction(async (tx) => {
    const pagamentoId = randomUUID();
    await tx.insert(pagamentosTable).values({
      id: pagamentoId,
      lojaId,
      colaboradorId: conta.colaboradorId,
      data: parsed.data.data,
      valorPago: parsed.data.valorPago,
      forma: parsed.data.forma ?? null,
      observacoes: parsed.data.observacoes ?? null,
    });
    await tx.insert(pagamentoItensTable).values({
      id: randomUUID(),
      lojaId,
      pagamentoId,
      contaPagarId: conta.id,
      valor: parsed.data.valorPago,
    });
    const [atualizada] = await tx.update(contasPagarTable)
      .set({ status: "PAGA" })
      .where(eq(contasPagarTable.id, conta.id))
      .returning();
    return atualizada;
  });

  res.json(PagarContaPagarResponse.parse(contaPaga));
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
    usuarioId: parsed.data.usuarioId,
    valor: parsed.data.valor,
    diaVencimento: parsed.data.diaVencimento,
  }).returning();
  res.status(201).json(CreateSalarioRecorrenteResponse.parse(salario));
});

router.patch("/lojas/:lojaId/financeiro/salarios-recorrentes/:salarioId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const salarioId = req.params.salarioId as string;
  const parsed = UpdateSalarioRecorrenteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [salario] = await db.update(salariosRecorrentesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(salariosRecorrentesTable.id, salarioId), eq(salariosRecorrentesTable.lojaId, lojaId)))
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
      competencia: parsed.data.competencia,
      valor: parsed.data.valor,
    })
    .onConflictDoUpdate({
      target: [saldosReferenciaTable.lojaId, saldosReferenciaTable.competencia],
      set: { valor: parsed.data.valor },
    })
    .returning();
  res.json(CreateSaldoReferenciaResponse.parse(saldo));
});

export default router;
