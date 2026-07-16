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
import { eq, and, inArray, gte, lt, desc } from "drizzle-orm";
import {
  PagarContaPagarBody,
  PagarContaPagarResponse,
  ListPagamentosQueryParams,
  ListPagamentosResponse,
  CreatePagamentoBody,
  CreatePagamentoResponse,
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
import { addDias, inicioDoDia } from "../lib/disponibilidade";
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

// Remover conta: só PREVISTA. Uma conta PAGA é rastro de caixa — o caminho é
// estornar o pagamento primeiro (senão o DELETE em cascata levaria junto o
// pagamento_item e a saída ficaria sem contrapartida).
router.delete("/lojas/:lojaId/contas-pagar/:contaId", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const contaId = req.params.contaId as string;

  const [conta] = await db.select().from(contasPagarTable)
    .where(and(eq(contasPagarTable.id, contaId), eq(contasPagarTable.lojaId, lojaId)));
  if (!conta) {
    res.status(404).json({ error: "Conta not found" });
    return;
  }
  if (conta.status === "PAGA") {
    res.status(409).json({ error: "CONTA_JA_PAGA", detalhe: "Estorne o pagamento antes de remover a conta" });
    return;
  }

  await db.delete(contasPagarTable).where(eq(contasPagarTable.id, conta.id));
  res.status(204).end();
});

// O caixa realizado. `de`/`ate` são dias locais inclusivos: o fim vira o
// início do dia seguinte (exclusivo) para pegar o dia inteiro.
router.get("/lojas/:lojaId/financeiro/pagamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = ListPagamentosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtro inválido (de/ate esperam YYYY-MM-DD)" });
    return;
  }
  const { de, ate, colaboradorId } = parsed.data;
  if (de && ate && de > ate) {
    res.status(400).json({ error: "INTERVALO_INVALIDO", detalhe: "'de' não pode ser depois de 'ate'" });
    return;
  }

  const pagamentos = await db.query.pagamentosTable.findMany({
    where: and(
      eq(pagamentosTable.lojaId, lojaId),
      ...(de ? [gte(pagamentosTable.data, inicioDoDia(de))] : []),
      ...(ate ? [lt(pagamentosTable.data, inicioDoDia(addDias(ate, 1)))] : []),
      ...(colaboradorId ? [eq(pagamentosTable.colaboradorId, colaboradorId)] : []),
    ),
    with: { colaborador: true, itens: { with: { contaPagar: true } } },
    orderBy: desc(pagamentosTable.data),
  });
  res.json(ListPagamentosResponse.parse(pagamentos));
});

// Uma saída de caixa que quita N contas. Sem valorPago, a saída vale a soma
// das contas; o rateio por conta vai em pagamento_itens (contaPagarId é UNIQUE
// — cinto de segurança do banco contra pagar a mesma conta duas vezes).
router.post("/lojas/:lojaId/financeiro/pagamentos", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const parsed = CreatePagamentoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const contaIds = [...new Set(parsed.data.contaIds)];

  const contas = await db.select().from(contasPagarTable)
    .where(and(eq(contasPagarTable.lojaId, lojaId), inArray(contasPagarTable.id, contaIds)));
  if (contas.length !== contaIds.length) {
    res.status(404).json({ error: "CONTA_NAO_ENCONTRADA", detalhe: "Alguma conta não existe nesta loja" });
    return;
  }
  const jaPagas = contas.filter((c) => c.status === "PAGA");
  if (jaPagas.length > 0) {
    res.status(409).json({
      error: "CONTA_JA_PAGA",
      detalhe: `Já paga(s): ${jaPagas.map((c) => c.descricao).join(", ")}`,
    });
    return;
  }

  const previstoCentavos = contas.map((c) => Math.round(c.valorPrevisto * 100));
  const somaCentavos = previstoCentavos.reduce((s, v) => s + v, 0);
  const pagoCentavos =
    parsed.data.valorPago !== undefined ? Math.round(parsed.data.valorPago * 100) : somaCentavos;
  const valorPago = pagoCentavos / 100;

  // O item guarda o que a conta REALMENTE consumiu da saída, não o previsto:
  // sum(itens.valor) === pagamento.valorPago é o invariante que o fluxo e o DRE
  // dependem (a rota single-conta já o mantém). Num pagamento com desconto o
  // abatimento rateia proporcional ao previsto, em centavos, e a última conta
  // absorve o resto da divisão — mesma convenção do gerar-plano de parcelas.
  const rateioCentavos = previstoCentavos.map((v) =>
    somaCentavos === 0 ? 0 : Math.round((v * pagoCentavos) / somaCentavos),
  );
  const distribuido = rateioCentavos.reduce((s, v) => s + v, 0);
  if (rateioCentavos.length > 0) rateioCentavos[rateioCentavos.length - 1] += pagoCentavos - distribuido;

  // Colaborador da saída só quando TODAS as contas são do mesmo — uma saída
  // que mistura pessoas não pertence a ninguém.
  const colaboradores = new Set(contas.map((c) => c.colaboradorId));
  const colaboradorId = colaboradores.size === 1 ? (contas[0].colaboradorId ?? null) : null;

  const pagamentoId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(pagamentosTable).values({
      id: pagamentoId,
      lojaId,
      colaboradorId,
      data: parsed.data.data,
      valorPago,
      forma: parsed.data.forma ?? null,
      observacoes: parsed.data.observacoes ?? null,
    });
    await tx.insert(pagamentoItensTable).values(
      contas.map((c, i) => ({
        id: randomUUID(),
        lojaId,
        pagamentoId,
        contaPagarId: c.id,
        valor: rateioCentavos[i] / 100,
      })),
    );
    await tx.update(contasPagarTable)
      .set({ status: "PAGA" })
      .where(inArray(contasPagarTable.id, contaIds));
  });

  const criado = await db.query.pagamentosTable.findFirst({
    where: eq(pagamentosTable.id, pagamentoId),
    with: { colaborador: true, itens: { with: { contaPagar: true } } },
  });
  res.status(201).json(CreatePagamentoResponse.parse(criado));
});

// Estornar a saída: as contas voltam a PREVISTA e o pagamento some do caixa
// (os itens caem por cascata do FK).
router.post("/lojas/:lojaId/financeiro/pagamentos/:pagamentoId/estornar", async (req, res): Promise<void> => {
  const lojaId = req.params.lojaId as string;
  const pagamentoId = req.params.pagamentoId as string;

  const pagamento = await db.query.pagamentosTable.findFirst({
    where: and(eq(pagamentosTable.id, pagamentoId), eq(pagamentosTable.lojaId, lojaId)),
    with: { itens: true },
  });
  if (!pagamento) {
    res.status(404).json({ error: "Pagamento not found" });
    return;
  }

  const contaIds = pagamento.itens.map((i) => i.contaPagarId);
  await db.transaction(async (tx) => {
    if (contaIds.length > 0) {
      await tx.update(contasPagarTable)
        .set({ status: "PREVISTA" })
        .where(and(eq(contasPagarTable.lojaId, lojaId), inArray(contasPagarTable.id, contaIds)));
    }
    await tx.delete(pagamentosTable).where(eq(pagamentosTable.id, pagamento.id));
  });
  res.status(204).end();
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
  // Conferir de novo o mesmo dia é corrigir o número, não empilhar outro saldo.
  const [saldo] = await db.insert(saldosReferenciaTable)
    .values({
      id: randomUUID(),
      lojaId,
      dataReferencia: new Date(parsed.data.dataReferencia),
      valor: parsed.data.valor,
    })
    .onConflictDoUpdate({
      target: [saldosReferenciaTable.lojaId, saldosReferenciaTable.dataReferencia],
      set: { valor: parsed.data.valor },
    })
    .returning();
  res.json(CreateSaldoReferenciaResponse.parse(saldo));
});

export default router;
