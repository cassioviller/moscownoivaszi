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
import { gerarContratoPdf } from "../lib/contrato-pdf";
import {
  EstornarParcelaResponse,
  GerarPlanoParcelasBody,
  GerarPlanoParcelasResponse,
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

/** Dinheiro soma em CENTAVOS inteiros — reais é float e não fecha na soma. */
const cent = (reais: number) => Math.round(reais * 100);
const reais = (centavos: number) => centavos / 100;

/**
 * Líquido em centavos a partir do bruto e do desconto do orçamento, calculado
 * EXATAMENTE como o frontend (`orcamentos/[id].tsx`) — senão um contrato válido
 * seria recusado por um centavo de arredondamento divergente.
 */
function liquidoEmCentavos(brutoC: number, tipo: string | null, valor: number | null): number {
  if (!tipo || !valor) return brutoC;
  if (tipo === "PERCENTUAL") return Math.round((brutoC * (100 - valor)) / 100);
  return Math.max(0, brutoC - cent(valor)); // VALOR
}

type ItemSnapshot = Pick<
  InsertContratoItem,
  "tipo" | "vestidoId" | "descricao" | "valorUnitario" | "quantidade"
>;

/** True se o contrato existe, é da loja e está ATIVO. */
async function contratoAtivo(contratoId: string, lojaId: string): Promise<boolean> {
  const [c] = await db.select({ status: contratosTable.status }).from(contratosTable)
    .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));
  return c?.status === "ATIVO";
}

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
  let descontoTipo: "PERCENTUAL" | "VALOR" | null = null;
  let descontoValor: number | null = null;
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

    // Congela o desconto do orçamento e VALIDA o valorTotal contra os itens: o
    // líquido derivado (itens − desconto, em centavos) tem que bater exatamente
    // com o total informado. Sem isto, um total digitado errado — ou o desconto
    // que se perdia no snapshot — passava batido e virava a base de comissão,
    // parcelas e PDF, com a soma dos itens sem fechar com o total.
    descontoTipo = orcamento.descontoTipo;
    descontoValor = orcamento.descontoValor;
    const brutoC = itens.reduce((acc, it) => acc + cent(it.valorUnitario) * it.quantidade, 0);
    const liquidoC = liquidoEmCentavos(brutoC, orcamento.descontoTipo, orcamento.descontoValor);
    if (liquidoC !== cent(contratoData.valorTotal)) {
      res.status(422).json({
        error: "VALOR_TOTAL_NAO_BATE",
        detalhe: `Itens menos desconto (${reais(liquidoC)}) difere do valor total (${contratoData.valorTotal})`,
      });
      return;
    }
  }

  // 4. Se houver parcelas, a soma precisa bater com o valorTotal. Em CENTAVOS
  // inteiros, com igualdade EXATA — a regra de ouro do repo. Somar os reais em
  // float e comparar com tolerância (o que estava aqui) aceita um plano com um
  // centavo de folga e recusa um plano válido por erro de ponto flutuante.
  if (parcelasInput && parcelasInput.length > 0) {
    const somaC = parcelasInput.reduce((acc, p) => acc + cent(p.valorPrevisto), 0);
    if (somaC !== cent(contratoData.valorTotal)) {
      res.status(422).json({
        error: "PARCELAS_NAO_BATEM",
        detalhe: `Soma das parcelas (${reais(somaC)}) difere do valor total (${contratoData.valorTotal})`,
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
      descontoTipo,
      descontoValor,
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

// Rótulos PT-BR das formas de pagamento — o documento é lido pela noiva, não
// pela máquina, então o enum cru (CARTAO_CREDITO) não pode vazar para o papel.
const ROTULO_FORMA: Record<string, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  OUTRO: "Outro",
};
const rotuloForma = (f: string | null | undefined) => (f ? (ROTULO_FORMA[f] ?? f) : undefined);

// UTC no formato de data: vencimento/casamento são dias civis gravados à
// meia-noite UTC; formatar no fuso local jogaria o dia para trás.
const dataBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Nome de arquivo seguro: só ASCII, pois o header Content-Disposition não
// carrega acento sem codificação extra.
function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "noiva"
  );
}

// PDF do contrato. Escopado por loja (contrato de outra loja → 404) e gerado na
// hora a partir do estado atual — nada é persistido.
router.get("/lojas/:lojaId/contratos/:contratoId/pdf", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { loja: true, lead: true, parcelas: true, itens: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }

  // Canceladas não entram no documento: o papel mostra o que a noiva deve.
  const parcelas = [...contrato.parcelas]
    .filter((p) => p.status !== "CANCELADA")
    .sort((a, b) => a.numero - b.numero)
    .map((p) => ({
      // O NÚMERO manda sobre a descrição: quem cria o contrato grava um genérico
      // "Parcela 0", mas entrada é definida por numero 0 (mesma regra da tela).
      descricao: p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`,
      valor: brl(p.valorPrevisto),
      vencimento: dataBR.format(p.vencimento),
      forma: rotuloForma(p.formaRecebimento),
    }));

  const pdf = gerarContratoPdf({
    lojaNome: contrato.loja.nome,
    noivaNome: contrato.lead?.noivaNome ?? "",
    // O CPF do contrato manda: é o que foi conferido no fechamento.
    cpf: contrato.cpf ?? undefined,
    whatsapp: contrato.lead?.whatsapp ?? undefined,
    vestido: contrato.vestidoDescricao ?? undefined,
    itens: contrato.itens.map((it) => ({
      descricao: `${it.quantidade}x ${it.descricao}`,
      // Centavos inteiros na multiplicação: 3 × 0.1 em reais viraria 0.30000000000000004.
      valor: brl((it.quantidade * Math.round(it.valorUnitario * 100)) / 100),
    })),
    // Com desconto, o subtotal (bruto) e o abatimento explicam por que a soma
    // dos itens não é o total. O abatimento é bruto − total: reconcilia sempre.
    ...(() => {
      if (!contrato.descontoTipo) return {};
      const brutoC = contrato.itens.reduce((acc, it) => acc + Math.round(it.valorUnitario * 100) * it.quantidade, 0);
      const abatimentoC = brutoC - Math.round(contrato.valorTotal * 100);
      const rotulo = contrato.descontoTipo === "PERCENTUAL" ? ` (${contrato.descontoValor}%)` : "";
      return { subtotal: brl(brutoC / 100), desconto: `−${brl(abatimentoC / 100)}${rotulo}` };
    })(),
    valorTotal: brl(contrato.valorTotal),
    formaPagamento: rotuloForma(contrato.formaPagamento),
    parcelas,
    dataCasamento: contrato.dataCasamento ? dataBR.format(contrato.dataCasamento) : undefined,
    dataRetirada: contrato.dataRetirada ? dataBR.format(contrato.dataRetirada) : undefined,
    dataDevolucao: contrato.dataDevolucao ? dataBR.format(contrato.dataDevolucao) : undefined,
    dataContrato: dataBR.format(contrato.fechadoEm),
    observacao: contrato.observacoes ?? undefined,
  });

  res.status(200)
    .type("application/pdf")
    .setHeader("Content-Disposition", `inline; filename="contrato-${slug(contrato.lead?.noivaNome ?? "")}.pdf"`);
  res.send(Buffer.from(pdf));
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
    // `comissaoEstornadaEm` NÃO é gravado aqui: ele marca quando o estorno foi
    // RECONCILIADO num fechamento, e não quando o contrato caiu (isso é o
    // `canceladoEm`). Deixá-lo nulo é o que mantém o estorno §6.4 pendente para
    // o próximo fechamento abater; preenchê-lo agora faria a comissão já paga
    // sobre esta venda nunca voltar.
    await tx.update(contratosTable)
      .set({
        status: "CANCELADO",
        canceladoEm: agora,
        canceladoMotivo: parsed.data.motivo,
        updatedAt: agora,
      })
      .where(and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)));

    // Parcelas PREVISTAS sempre são canceladas.
    await tx.update(parcelasTable)
      .set({ status: "CANCELADA" })
      .where(and(
        eq(parcelasTable.contratoId, contrato.id),
        eq(parcelasTable.status, "PREVISTA"),
      ));

    // Sobre as PAGAS decide o destinoPago: "manter" (default — noiva perdeu
    // o sinal, valor fica no caixa) ou "estornar" (valor devolvido — viram
    // CANCELADA com os campos de recebimento zerados, saindo da receita).
    if (parsed.data.destinoPago === "estornar") {
      await tx.update(parcelasTable)
        .set({
          status: "CANCELADA",
          valorRecebido: null,
          recebidoEm: null,
          formaRecebimento: null,
        })
        .where(and(
          eq(parcelasTable.contratoId, contrato.id),
          eq(parcelasTable.status, "PAGA"),
        ));
    }

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
  if (!(await contratoAtivo(existente.contratoId, lojaId as string))) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
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

// Estorno avulso: PAGA volta a PREVISTA (volta a ser cobrável), zerando os
// campos de recebimento. Distinto do estorno em massa do cancelamento com
// destinoPago=estornar, que marca as pagas como CANCELADA.
router.post("/lojas/:lojaId/parcelas/:parcelaId/estornar", async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "Parcela not found" });
    return;
  }
  if (existente.status !== "PAGA") {
    res.status(422).json({ error: "PARCELA_NAO_PAGA", detalhe: "Só parcelas pagas podem ser estornadas" });
    return;
  }
  // Estornar devolve a parcela a PREVISTA (cobrável). Num contrato cancelado
  // isso ressuscitaria uma cobrança de um contrato morto — a receita/DRE leem
  // PREVISTA. Só contrato ativo pode ter parcela mexida.
  if (!(await contratoAtivo(existente.contratoId, lojaId as string))) {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  const [parcela] = await db.update(parcelasTable)
    .set({
      status: "PREVISTA",
      valorRecebido: null,
      recebidoEm: null,
      formaRecebimento: null,
    })
    .where(eq(parcelasTable.id, existente.id))
    .returning();
  res.json(EstornarParcelaResponse.parse(parcela));
});

router.delete("/lojas/:lojaId/parcelas/:parcelaId", async (req, res): Promise<void> => {
  const { lojaId, parcelaId } = req.params;

  const [existente] = await db.select().from(parcelasTable)
    .where(and(eq(parcelasTable.id, parcelaId as string), eq(parcelasTable.lojaId, lojaId as string)));
  if (!existente) {
    res.status(404).json({ error: "Parcela not found" });
    return;
  }
  if (existente.status !== "PREVISTA") {
    res.status(422).json({ error: "PARCELA_NAO_PREVISTA", detalhe: "Só parcelas previstas podem ser removidas" });
    return;
  }
  const [contrato] = await db.select({ status: contratosTable.status }).from(contratosTable)
    .where(eq(contratosTable.id, existente.contratoId));
  if (!contrato || contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }

  await db.delete(parcelasTable).where(eq(parcelasTable.id, existente.id));
  res.status(204).send();
});

const DIA_MS = 86_400_000;

// Gera o plano de pagamento de um contrato sem parcelas. Cálculo em centavos;
// a última parcela absorve o resto da divisão (sem drift de arredondamento).
// Entrada (se > 0) vira a linha `numero 0` no primeiro vencimento e as N
// parcelas começam um período depois.
router.post("/lojas/:lojaId/contratos/:contratoId/parcelas/gerar-plano", async (req, res): Promise<void> => {
  const { lojaId, contratoId } = req.params as { lojaId: string; contratoId: string };
  const parsed = GerarPlanoParcelasBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const contrato = await db.query.contratosTable.findFirst({
    where: and(eq(contratosTable.id, contratoId), eq(contratosTable.lojaId, lojaId)),
    with: { parcelas: true },
  });
  if (!contrato) {
    res.status(404).json({ error: "Contrato not found" });
    return;
  }
  if (contrato.status !== "ATIVO") {
    res.status(422).json({ error: "CONTRATO_NAO_ATIVO", detalhe: "Contrato não está ativo" });
    return;
  }
  if (contrato.parcelas.length > 0) {
    res.status(409).json({ error: "JA_TEM_PLANO", detalhe: "Contrato já possui parcelas" });
    return;
  }

  const totalCentavos = Math.round(Number(contrato.valorTotal) * 100);
  const entradaCentavos = Math.round((parsed.data.entrada ?? 0) * 100);
  if (entradaCentavos > totalCentavos) {
    res.status(422).json({ error: "ENTRADA_MAIOR", detalhe: "Entrada maior que o valor total do contrato" });
    return;
  }

  const n = parsed.data.numParcelas;
  const periodicidadeDias = parsed.data.periodicidadeDias ?? 30;
  const venc0 = new Date(parsed.data.primeiroVencimento);
  const restante = totalCentavos - entradaCentavos;
  const base = Math.floor(restante / n);

  const linhas: (typeof parcelasTable.$inferInsert)[] = [];
  if (entradaCentavos > 0) {
    linhas.push({
      id: randomUUID(),
      lojaId,
      contratoId: contrato.id,
      numero: 0,
      descricao: "Entrada",
      valorPrevisto: entradaCentavos / 100,
      vencimento: venc0,
    });
  }
  const offsetInicial = entradaCentavos > 0 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const valor = i === n - 1 ? restante - base * (n - 1) : base;
    linhas.push({
      id: randomUUID(),
      lojaId,
      contratoId: contrato.id,
      numero: i + 1,
      descricao: `Parcela ${i + 1}/${n}`,
      valorPrevisto: valor / 100,
      vencimento: new Date(venc0.getTime() + (i + offsetInicial) * periodicidadeDias * DIA_MS),
    });
  }

  // createMany atômico: sem plano parcial.
  const criadas = await db.insert(parcelasTable).values(linhas).returning();
  criadas.sort((a, b) => a.numero - b.numero);
  res.status(201).json(GerarPlanoParcelasResponse.parse(criadas));
});

export default router;
