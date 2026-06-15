// src/lib/contratos/contratos.ts
// Contratos — a VENDA persistida. Nasce pré-preenchido de um orçamento aprovado (S2) ou
// da noiva, é conferido/ajustado pela vendedora, e gera o PDF do contrato salvo. Base do
// financeiro (S4+) e da comissão (S6). Tudo escopado por loja via tenantPrisma; dinheiro
// pelo util compartilhado. Decisão: docs/.../2026-06-03-s3-contratos-design.md.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { paraCentavos, deCentavos } from "@/lib/dinheiro";
import { calcularTotais } from "@/lib/orcamentos/orcamentos";
import { listarVestidosReservadosDaNoiva } from "@/lib/disponibilidade/reservas";
import { parseDiaUTC } from "@/lib/disponibilidade/datas";
import type { DadosContrato } from "@/lib/contratos/pdf";
import { listarParcelasDoContrato } from "@/lib/financeiro/receber";
import { formaValida, rotuloForma } from "@/lib/financeiro/forma";
import type { ContratoStatus, FormaPagamento } from "@/generated/prisma/client";

// "YYYY-MM-DD" → DateTime meia-noite UTC; "" / null → null. Lança em data inválida.
// Delega ao parser estrito do motor, que rejeita datas impossíveis ("2027-02-30")
// que a checagem antiga (isNaN) deixava passar (rolavam para o mês seguinte).
function diaParaData(s: string | null | undefined): Date | null {
  const t = (s ?? "").trim();
  if (t === "") return null;
  try {
    return parseDiaUTC(t);
  } catch {
    throw new Error("data inválida");
  }
}

function ehErroP2002(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export type ResultadoCriar =
  | { ok: true; contratoId: string }
  | { ok: false; motivo: "orcamento_invalido" | "nao_aprovado" | "ja_tem_contrato" | "lead_invalido" | "vendedora_invalida" };

/**
 * Cria um contrato pré-preenchido a partir de um orçamento APROVADO: valor (= total do
 * orçamento), vestido e datas vêm do orçamento + reserva da noiva. A vendedora confere o
 * resto (CPF, forma de pagamento) no detalhe. `orcamentoId @unique` barra duplicar.
 */
export async function criarContratoDeOrcamento(lojaId: string, orcamentoId: string): Promise<ResultadoCriar> {
  const db = tenantPrisma(prisma, lojaId);
  const orc = await db.orcamento.findUnique({
    where: { id: orcamentoId },
    include: { itens: true, lead: { select: { casamentoData: true } } },
  });
  if (!orc) return { ok: false, motivo: "orcamento_invalido" };
  if (orc.status !== "APROVADO") return { ok: false, motivo: "nao_aprovado" };

  const total = calcularTotais(orc.itens, orc.descontoTipo, orc.descontoValor).total;
  const itemVestido = orc.itens.find((i) => i.tipo === "VESTIDO");
  const reservas = await listarVestidosReservadosDaNoiva(lojaId, orc.leadId);
  // Casa a reserva pelo VESTIDO do item do orçamento (a noiva pode ter várias reservas).
  // Sem item-vestido identificável, só anexa se houver UMA reserva (senão fica ambíguo).
  const reserva = itemVestido?.vestidoId
    ? (reservas.find((r) => r.vestidoId === itemVestido.vestidoId) ?? null)
    : reservas.length === 1
      ? reservas[0]
      : null;

  try {
    const c = await db.contrato.create({
      data: {
        leadId: orc.leadId,
        orcamentoId: orc.id,
        vendedoraId: orc.vendedoraId,
        bloqueioVestidoId: reserva?.id ?? null,
        valorTotal: total,
        vestidoDescricao: reserva ? `${reserva.codigo} · ${reserva.nome}` : (itemVestido?.descricao ?? null),
        dataCasamento: orc.lead.casamentoData ?? reserva?.casamentoData ?? null,
        observacoes: orc.observacoes ?? null,
      } as never,
    });
    return { ok: true, contratoId: c.id };
  } catch (e) {
    if (ehErroP2002(e)) return { ok: false, motivo: "ja_tem_contrato" };
    throw e;
  }
}

/** Contrato "em branco" a partir da noiva (sem orçamento) — fallback. Valor inicial 0. */
export async function criarContratoDaNoiva(lojaId: string, leadId: string, vendedoraId: string): Promise<ResultadoCriar> {
  const db = tenantPrisma(prisma, lojaId);
  const [lead, vinc] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { casamentoData: true } }),
    prisma.usuarioLoja.findUnique({ where: { usuarioId_lojaId: { usuarioId: vendedoraId, lojaId } }, select: { usuarioId: true } }),
  ]);
  if (!lead) return { ok: false, motivo: "lead_invalido" };
  if (!vinc) return { ok: false, motivo: "vendedora_invalida" };

  const reservas = await listarVestidosReservadosDaNoiva(lojaId, leadId);
  // Sem orçamento p/ desambiguar: só anexa se houver UMA reserva.
  const reserva = reservas.length === 1 ? reservas[0] : null;

  const c = await db.contrato.create({
    data: {
      leadId,
      vendedoraId,
      bloqueioVestidoId: reserva?.id ?? null,
      valorTotal: "0.00",
      vestidoDescricao: reserva ? `${reserva.codigo} · ${reserva.nome}` : null,
      dataCasamento: lead.casamentoData ?? reserva?.casamentoData ?? null,
    } as never,
  });
  return { ok: true, contratoId: c.id };
}

export type ResultadoOp =
  | { ok: true }
  | { ok: false; motivo: "contrato_invalido" | "nao_ativo" | "valor_invalido" | "data_invalida" | "forma_invalida" };

export type PatchContrato = {
  cpf?: string;
  vestidoDescricao?: string;
  valorTotal?: string;
  formaPagamento?: string; // "" limpa; valor deve ser do enum FormaPagamento
  dataCasamento?: string;
  dataRetirada?: string;
  dataDevolucao?: string;
  observacoes?: string;
};

export async function editarContrato(lojaId: string, contratoId: string, patch: PatchContrato): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const c = await db.contrato.findUnique({ where: { id: contratoId }, select: { status: true } });
  if (!c) return { ok: false, motivo: "contrato_invalido" };
  if (c.status !== "ATIVO") return { ok: false, motivo: "nao_ativo" };

  const data: Record<string, unknown> = {};
  const vazioNull = (v: string) => (v.trim() === "" ? null : v.trim());
  if (patch.cpf !== undefined) data.cpf = vazioNull(patch.cpf);
  if (patch.vestidoDescricao !== undefined) data.vestidoDescricao = vazioNull(patch.vestidoDescricao);
  if (patch.observacoes !== undefined) data.observacoes = vazioNull(patch.observacoes);
  if (patch.formaPagamento !== undefined) {
    const f = patch.formaPagamento.trim();
    if (f === "") data.formaPagamento = null;
    else if (!formaValida(f)) return { ok: false, motivo: "forma_invalida" };
    else data.formaPagamento = f;
  }

  if (patch.valorTotal !== undefined) {
    try {
      data.valorTotal = deCentavos(paraCentavos(patch.valorTotal));
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
  }
  try {
    for (const [campo, val] of [
      ["dataCasamento", patch.dataCasamento],
      ["dataRetirada", patch.dataRetirada],
      ["dataDevolucao", patch.dataDevolucao],
    ] as const) {
      if (val !== undefined) data[campo] = diaParaData(val);
    }
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }

  await db.contrato.updateMany({ where: { id: contratoId }, data });
  return { ok: true };
}

export type DestinoPago = "manter" | "estornar";

/**
 * Cancela (distrato) um contrato ATIVO. As parcelas em aberto (PREVISTA) sempre viram
 * CANCELADA — saindo automaticamente das leituras de recebíveis/cobrança/projeção, que
 * só leem PREVISTA/PAGA. Sobre o que já foi recebido (PAGA), o gestor escolhe:
 *  - "manter": cliente perdeu o sinal → a parcela paga fica como recebida (segue no caixa/DRE);
 *  - "estornar": valor devolvido → a parcela paga também vira CANCELADA (sai da receita).
 * Tudo numa transação. lojaId explícito no where preserva o isolamento (o contrato já foi
 * validado como da loja via tenantPrisma acima) — `tx` do $transaction não passa pelo guard.
 */
export async function cancelarContrato(
  lojaId: string,
  contratoId: string,
  opts: { destinoPago: DestinoPago; motivo?: string },
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const c = await db.contrato.findUnique({ where: { id: contratoId }, select: { status: true } });
  if (!c) return { ok: false, motivo: "contrato_invalido" };
  if (c.status !== "ATIVO") return { ok: false, motivo: "nao_ativo" };

  const ops = [
    prisma.contrato.updateMany({
      where: { id: contratoId, lojaId },
      data: { status: "CANCELADO", canceladoMotivo: opts.motivo?.trim() || null },
    }),
    prisma.parcela.updateMany({ where: { contratoId, lojaId, status: "PREVISTA" }, data: { status: "CANCELADA" } }),
  ];
  if (opts.destinoPago === "estornar") {
    ops.push(
      prisma.parcela.updateMany({
        where: { contratoId, lojaId, status: "PAGA" },
        data: { status: "CANCELADA", valorRecebido: null, recebidoEm: null, formaRecebimento: null },
      }),
    );
  }
  await prisma.$transaction(ops);
  return { ok: true };
}

// — Leitura —

export type ContratoResumo = {
  id: string;
  status: ContratoStatus;
  leadId: string;
  noivaNome: string | null;
  valorTotal: string;
  fechadoEm: Date;
};

const INCLUDE_RESUMO = { lead: { select: { noivaNome: true } } } as const;

function resumo(c: {
  id: string;
  status: ContratoStatus;
  leadId: string;
  valorTotal: { toString(): string };
  fechadoEm: Date;
  lead: { noivaNome: string | null } | null;
}): ContratoResumo {
  return {
    id: c.id,
    status: c.status,
    leadId: c.leadId,
    noivaNome: c.lead?.noivaNome ?? null,
    valorTotal: Number(c.valorTotal).toFixed(2),
    fechadoEm: c.fechadoEm,
  };
}

export async function listarContratosDaLoja(lojaId: string, opts: { status?: ContratoStatus } = {}): Promise<ContratoResumo[]> {
  const rows = await tenantPrisma(prisma, lojaId).contrato.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { fechadoEm: "desc" },
    include: INCLUDE_RESUMO,
  });
  return rows.map(resumo);
}

export async function listarContratosDaNoiva(lojaId: string, leadId: string): Promise<ContratoResumo[]> {
  const rows = await tenantPrisma(prisma, lojaId).contrato.findMany({
    where: { leadId },
    orderBy: { fechadoEm: "desc" },
    include: INCLUDE_RESUMO,
  });
  return rows.map(resumo);
}

export type ContratoDetalhe = {
  id: string;
  status: ContratoStatus;
  leadId: string;
  noivaNome: string | null;
  vendedoraNome: string;
  orcamentoId: string | null;
  cpf: string | null;
  vestidoDescricao: string | null;
  valorTotal: string;
  formaPagamento: FormaPagamento | null;
  dataCasamento: Date | null;
  dataRetirada: Date | null;
  dataDevolucao: Date | null;
  observacoes: string | null;
  fechadoEm: Date;
  editavel: boolean;
};

export async function obterContrato(lojaId: string, contratoId: string): Promise<ContratoDetalhe | null> {
  const c = await tenantPrisma(prisma, lojaId).contrato.findUnique({
    where: { id: contratoId },
    include: { lead: { select: { noivaNome: true } }, vendedora: { select: { nome: true } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    status: c.status,
    leadId: c.leadId,
    noivaNome: c.lead?.noivaNome ?? null,
    vendedoraNome: c.vendedora.nome,
    orcamentoId: c.orcamentoId,
    cpf: c.cpf,
    vestidoDescricao: c.vestidoDescricao,
    valorTotal: Number(c.valorTotal).toFixed(2),
    formaPagamento: c.formaPagamento,
    dataCasamento: c.dataCasamento,
    dataRetirada: c.dataRetirada,
    dataDevolucao: c.dataDevolucao,
    observacoes: c.observacoes,
    fechadoEm: c.fechadoEm,
    editavel: c.status === "ATIVO",
  };
}

const dataBR = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const brl = (v: { toString(): string }) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Monta o DadosContrato (pdf.ts) a partir do contrato persistido. null se não for da loja. */
export async function dadosParaPdf(lojaId: string, contratoId: string): Promise<DadosContrato | null> {
  const c = await tenantPrisma(prisma, lojaId).contrato.findUnique({
    where: { id: contratoId },
    include: { lead: { select: { noivaNome: true, whatsapp: true } }, loja: { select: { nome: true } } },
  });
  if (!c) return null;
  // Entrada e parcelas vêm do plano (fonte única). Canceladas não entram no documento.
  const parcelas = (await listarParcelasDoContrato(lojaId, contratoId))
    .filter((p) => p.status !== "CANCELADA")
    .map((p) => ({
      descricao: p.descricao ?? (p.numero === 0 ? "Entrada" : `Parcela ${p.numero}`),
      valor: brl(p.valorPrevisto),
      vencimento: dataBR.format(p.vencimento),
      forma: p.formaRecebimento ? rotuloForma(p.formaRecebimento) : undefined,
    }));
  return {
    lojaNome: c.loja.nome,
    noivaNome: c.lead?.noivaNome ?? "",
    cpf: c.cpf ?? undefined,
    whatsapp: c.lead?.whatsapp ?? undefined,
    vestido: c.vestidoDescricao ?? undefined,
    valorTotal: brl(c.valorTotal),
    formaPagamento: c.formaPagamento ? rotuloForma(c.formaPagamento) : undefined,
    parcelas,
    dataCasamento: c.dataCasamento ? dataBR.format(c.dataCasamento) : undefined,
    dataRetirada: c.dataRetirada ? dataBR.format(c.dataRetirada) : undefined,
    dataDevolucao: c.dataDevolucao ? dataBR.format(c.dataDevolucao) : undefined,
    dataContrato: dataBR.format(c.fechadoEm),
    observacao: c.observacoes ?? undefined,
  };
}
