import { Router, type IRouter } from "express";
import {
  db,
  contratosTable,
  contratoItensTable,
  parcelasTable,
  bloqueioVestidosTable,
  orcamentosTable,
  orcamentoItensTable,
  leadsTable,
  type InsertContratoItem,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { verificarDisponibilidade, diaLocal } from "../lib/disponibilidade";
import { avancarEtapaLead } from "../lib/estados";
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
import { requireSessaoComLoja, requireModulo } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

router.use(requireSessaoComLoja);
router.use("/lojas/:lojaId/contratos", requireModulo("leads"));
router.use("/lojas/:lojaId/parcelas", requireModulo("leads"));

/** Tolerância de centavos ao comparar soma de parcelas com o valor total. */
const TOLERANCIA_CENTAVOS = 0.01;

type ItemSnapshot = Pick<
  InsertContratoItem,
  "tipo" | "vestidoId" | "descricao" | "valorUnitario" | "quantidade"
>;

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

  // 1. Lead precisa existir e pertencer à loja.
  const [lead] = await db.select({
    id: leadsTable.id,
    etapa: leadsTable.etapa,
    contratoFechadoEm: leadsTable.contratoFechadoEm,
  }).from(leadsTable)
    .where(and(eq(leadsTable.id, contratoData.leadId), eq(leadsTable.lojaId, lojaId)));
  if (!lead) {
    res.status(422).json({ error: "LEAD_INVALIDO", detalhe: "Lead não encontrado nesta loja" });
    return;
  }

  // 2. Um lead não pode ter dois contratos ATIVOS ao mesmo tempo.
  const [ativoExistente] = await db.select({ id: contratosTable.id }).from(contratosTable)
    .where(and(
      eq(contratosTable.leadId, contratoData.leadId),
      eq(contratosTable.lojaId, lojaId),
      eq(contratosTable.status, "ATIVO"),
    ));
  if (ativoExistente) {
    res.status(409).json({ error: "CONTRATO_ATIVO_DUPLICADO", detalhe: "Este lead já possui um contrato ativo" });
    return;
  }

  // 3. Orçamento (se informado): da loja, do mesmo lead, APROVADO, ainda não
  // vinculado a outro contrato. Seus itens viram snapshot do contrato.
  let itensSnapshot: ItemSnapshot[] = [];
  if (contratoData.orcamentoId) {
    const orcamento = await db.query.orcamentosTable.findFirst({
      where: and(eq(orcamentosTable.id, contratoData.orcamentoId), eq(orcamentosTable.lojaId, lojaId)),
    });
    if (!orcamento) {
      res.status(422).json({ error: "ORCAMENTO_INVALIDO", detalhe: "Orçamento não encontrado nesta loja" });
      return;
    }
    if (orcamento.leadId !== contratoData.leadId) {
      res.status(422).json({ error: "ORCAMENTO_INVALIDO", detalhe: "Orçamento pertence a outro lead" });
      return;
    }
    if (orcamento.status !== "APROVADO") {
      res.status(422).json({ error: "ORCAMENTO_NAO_APROVADO", detalhe: `Orçamento está ${orcamento.status}` });
      return;
    }
    const [jaVinculado] = await db.select({ id: contratosTable.id }).from(contratosTable)
      .where(eq(contratosTable.orcamentoId, contratoData.orcamentoId));
    if (jaVinculado) {
      res.status(409).json({ error: "ORCAMENTO_JA_VINCULADO", detalhe: "Orçamento já pertence a outro contrato" });
      return;
    }
    const itens = await db.select().from(orcamentoItensTable)
      .where(eq(orcamentoItensTable.orcamentoId, contratoData.orcamentoId));
    itensSnapshot = itens.map((it) => ({
      tipo: it.tipo,
      vestidoId: it.vestidoId,
      descricao: it.descricao,
      valorUnitario: it.valorUnitario,
      quantidade: it.quantidade,
    }));
  }

  // 4. Se houver parcelas, a soma precisa bater com o valorTotal.
  if (parcelasInput && parcelasInput.length > 0) {
    const soma = parcelasInput.reduce((acc, p) => acc + p.valorPrevisto, 0);
    if (Math.abs(soma - contratoData.valorTotal) > TOLERANCIA_CENTAVOS) {
      res.status(422).json({
        error: "PARCELAS_NAO_BATEM",
        detalhe: `Soma das parcelas (${soma}) difere do valor total (${contratoData.valorTotal})`,
      });
      return;
    }
  }

  // 5. Bloqueio (se informado): da loja, com data coerente e sem conflito.
  if (contratoData.bloqueioVestidoId) {
    const [bloqueio] = await db.select().from(bloqueioVestidosTable)
      .where(and(
        eq(bloqueioVestidosTable.id, contratoData.bloqueioVestidoId),
        eq(bloqueioVestidosTable.lojaId, lojaId),
      ));
    if (!bloqueio) {
      res.status(404).json({ error: "Bloqueio not found" });
      return;
    }
    if (
      contratoData.dataCasamento &&
      bloqueio.casamentoData &&
      diaLocal(contratoData.dataCasamento) !== diaLocal(bloqueio.casamentoData)
    ) {
      res.status(422).json({ error: "dataCasamento do contrato diverge da data do bloqueio" });
      return;
    }
    const resultado = await verificarDisponibilidade({
      lojaId,
      vestidoId: bloqueio.vestidoId,
      candidato: bloqueio,
      ignorarBloqueioId: bloqueio.id,
      hoje: new Date(),
    });
    if (!resultado.disponivel) {
      res.status(409).json({ error: "VESTIDO_INDISPONIVEL", conflitos: resultado.conflitos });
      return;
    }
  }

  // Persistência atômica: contrato + parcelas + snapshot de itens.
  const result = await db.transaction(async (tx) => {
    const [contrato] = await tx.insert(contratosTable).values({
      id: randomUUID(),
      lojaId,
      leadId: contratoData.leadId,
      orcamentoId: contratoData.orcamentoId ?? null,
      bloqueioVestidoId: contratoData.bloqueioVestidoId ?? null,
      vendedoraId: contratoData.vendedoraId,
      cpf: contratoData.cpf ?? null,
      vestidoDescricao: contratoData.vestidoDescricao ?? null,
      valorTotal: contratoData.valorTotal,
      formaPagamento: contratoData.formaPagamento ?? null,
      dataCasamento: contratoData.dataCasamento ?? null,
      dataRetirada: contratoData.dataRetirada ?? null,
      dataDevolucao: contratoData.dataDevolucao ?? null,
      observacoes: contratoData.observacoes ?? null,
      fechadoEm: new Date(),
    }).returning();

    if (parcelasInput && parcelasInput.length > 0) {
      await tx.insert(parcelasTable).values(
        parcelasInput.map((p) => ({
          id: randomUUID(),
          lojaId,
          contratoId: contrato.id,
          numero: p.numero,
          descricao: p.descricao ?? `Parcela ${p.numero}`,
          valorPrevisto: p.valorPrevisto,
          vencimento: p.vencimento,
          status: "PREVISTA" as const,
        }))
      );
    }

    if (itensSnapshot.length > 0) {
      await tx.insert(contratoItensTable).values(
        itensSnapshot.map((it) => ({
          id: randomUUID(),
          lojaId,
          contratoId: contrato.id,
          ...it,
        }))
      );
    }

    // Fechar contrato avança o funil do lead (nunca regride).
    const etapaNova = avancarEtapaLead(lead.etapa, "CONTRATO_FECHADO");
    if (etapaNova !== lead.etapa) {
      await tx.update(leadsTable)
        .set({
          etapa: etapaNova,
          contratoFechadoEm: lead.contratoFechadoEm ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leadsTable.id, lead.id));
    }

    return contrato;
  });

  const fullContrato = await db.query.contratosTable.findFirst({
    where: eq(contratosTable.id, result.id),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
  });

  res.status(201).json(CreateContratoResponse.parse(fullContrato));
});

router.get("/lojas/:lojaId/contratos/:contratoId", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
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

  const [contrato] = await db.update(contratosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(contratosTable.id, contratoId as string), eq(contratosTable.lojaId, lojaId as string)))
    .returning();

  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  res.json(UpdateContratoResponse.parse(contrato));
});

router.post("/lojas/:lojaId/contratos/:contratoId/cancelar", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = CancelarContratoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  if (contrato.status === "CANCELADO") {
    res.status(409).json({ error: "CONTRATO_JA_CANCELADO", detalhe: "Contrato já está cancelado" });
    return;
  }

  const agora = new Date();
  await db.transaction(async (tx) => {
    await tx.update(contratosTable)
      .set({
        status: "CANCELADO",
        canceladoEm: agora,
        canceladoMotivo: parsed.data.motivo,
        comissaoEstornadaEm: agora,
        updatedAt: agora,
      })
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));

    // Cancela apenas as parcelas ainda PREVISTAS — as PAGAS ficam como estão.
    await tx.update(parcelasTable)
      .set({ status: "CANCELADA" })
      .where(and(
        eq(parcelasTable.contratoId, contrato.id),
        eq(parcelasTable.status, "PREVISTA"),
      ));

    // Libera o vestido: soft-cancela o bloqueio vinculado (se houver).
    if (contrato.bloqueioVestidoId) {
      await tx.update(bloqueioVestidosTable)
        .set({ canceladoEm: agora, updatedAt: agora })
        .where(and(
          eq(bloqueioVestidosTable.id, contrato.bloqueioVestidoId),
          eq(bloqueioVestidosTable.lojaId, lojaId),
          isNull(bloqueioVestidosTable.canceladoEm),
        ));
    }
  });

  const fullContrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { lead: true, vendedora: true, parcelas: true, itens: true }
  });
  res.json(CancelarContratoResponse.parse(fullContrato));
});

// Parcelas
router.get("/lojas/:lojaId/contratos/:contratoId/parcelas", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params;
  const parcelas = await db.select().from(parcelasTable).where(and(eq(parcelasTable.contratoId, contratoId as string), eq(parcelasTable.lojaId, lojaId as string))).orderBy(parcelasTable.numero);
  res.json(ListParcelasResponse.parse(parcelas));
});

router.post("/lojas/:lojaId/parcelas/:parcelaId/receber", async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;
  const parsed = ReceberParcelaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "Parcela not found" });
    return;
  }
  if (existente.status === "PAGA") {
    res.status(409).json({ error: "PARCELA_JA_RECEBIDA", detalhe: "Esta parcela já foi recebida" });
    return;
  }
  if (existente.status === "CANCELADA") {
    res.status(422).json({ error: "PARCELA_CANCELADA", detalhe: "Parcela cancelada não pode ser recebida" });
    return;
  }

  const [parcela] = await db.update(parcelasTable)
    .set({
      status: "PAGA",
      recebidoEm: parsed.data.recebidoEm,
      valorRecebido: parsed.data.valorRecebido,
      formaRecebimento: parsed.data.formaRecebimento,
    })
    .where(eq(parcelasTable.id, existente.id))
    .returning();
  res.json(ReceberParcelaResponse.parse(parcela));
});

export default router;
