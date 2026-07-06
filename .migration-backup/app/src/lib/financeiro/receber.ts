// src/lib/financeiro/receber.ts
// Contas a RECEBER — o plano de pagamento (parcelas) que nasce do contrato (S4). Gerar
// plano, dar baixa (registrar recebimento) / estornar, carteira e resumo. ATRASADA é
// DERIVADO (vencido + PREVISTA), nunca gravado. Dinheiro em centavos (util compartilhado);
// tudo escopado por loja. Decisão: docs/.../2026-06-03-s4-contas-a-receber-design.md.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { paraCentavos, deCentavos, decParaCentavos, decParaString, decParaStringN } from "@/lib/dinheiro";
import { hojeUTC, diaParaData } from "@/lib/financeiro/datas";
import { ehAtrasada } from "@/lib/financeiro/obrigacao";
import { vencimentoNaJanela } from "@/lib/financeiro/intervalo";
import { paginar } from "@/lib/paginacao";
import { formaValida } from "@/lib/financeiro/forma";
import { montarPlano } from "@/lib/financeiro/plano";
import type { ParcelaStatus, FormaPagamento } from "@/generated/prisma/client";

// — Gerar plano —

export type ResultadoPlano =
  | { ok: true }
  | { ok: false; motivo: "contrato_invalido" | "nao_ativo" | "ja_tem_plano" | "num_invalido" | "data_invalida" | "entrada_maior" | "valor_invalido" };

export async function gerarPlanoDePagamento(
  lojaId: string,
  contratoId: string,
  input: { entrada?: string; numParcelas: number; primeiroVencimento: string; periodicidadeDias?: number },
): Promise<ResultadoPlano> {
  const db = tenantPrisma(prisma, lojaId);
  const contrato = await db.contrato.findUnique({
    where: { id: contratoId },
    select: { status: true, valorTotal: true, _count: { select: { parcelas: true } } },
  });
  if (!contrato) return { ok: false, motivo: "contrato_invalido" };
  if (contrato.status !== "ATIVO") return { ok: false, motivo: "nao_ativo" };
  if (contrato._count.parcelas > 0) return { ok: false, motivo: "ja_tem_plano" };

  const plano = montarPlano(decParaCentavos(contrato.valorTotal), input);
  if (!plano.ok) return plano; // motivos (num/data/entrada/valor) ⊂ ResultadoPlano

  // createMany = inserção ATÔMICA (sem plano parcial). O guard carimba lojaId em cada linha.
  await db.parcela.createMany({
    data: plano.linhas.map((l) => ({
      contratoId,
      numero: l.numero,
      descricao: l.descricao,
      valorPrevisto: deCentavos(l.valor),
      vencimento: l.vencimento,
    })) as never,
  });
  return { ok: true };
}

// — Ajuste manual de parcela —

export type ResultadoParcela =
  | { ok: true; parcelaId: string }
  | { ok: false; motivo: "contrato_invalido" | "nao_ativo" | "valor_invalido" | "data_invalida" };

export async function adicionarParcela(
  lojaId: string,
  contratoId: string,
  input: { descricao?: string; valorPrevisto: string; vencimento: string },
): Promise<ResultadoParcela> {
  const db = tenantPrisma(prisma, lojaId);
  const contrato = await db.contrato.findUnique({
    where: { id: contratoId },
    select: { status: true, _count: { select: { parcelas: true } } },
  });
  if (!contrato) return { ok: false, motivo: "contrato_invalido" };
  if (contrato.status !== "ATIVO") return { ok: false, motivo: "nao_ativo" };

  let valor: number, venc: Date;
  try {
    valor = paraCentavos(input.valorPrevisto);
  } catch {
    return { ok: false, motivo: "valor_invalido" };
  }
  try {
    venc = diaParaData(input.vencimento);
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  const criada = await db.parcela.create({
    data: {
      contratoId,
      numero: contrato._count.parcelas,
      descricao: input.descricao?.trim() || null,
      valorPrevisto: deCentavos(valor),
      vencimento: venc,
    } as never,
  });
  return { ok: true, parcelaId: criada.id };
}

export type ResultadoOp =
  | { ok: true }
  | { ok: false; motivo: "parcela_invalida" | "nao_previsto" | "nao_pago" | "valor_invalido" | "data_invalida" | "contrato_nao_ativo" | "forma_invalida" };

export async function editarParcela(
  lojaId: string,
  parcelaId: string,
  patch: { descricao?: string; valorPrevisto?: string; vencimento?: string },
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const p = await db.parcela.findUnique({ where: { id: parcelaId }, select: { status: true } });
  if (!p) return { ok: false, motivo: "parcela_invalida" };
  if (p.status !== "PREVISTA") return { ok: false, motivo: "nao_previsto" };

  const data: Record<string, unknown> = {};
  if (patch.descricao !== undefined) data.descricao = patch.descricao.trim() || null;
  if (patch.valorPrevisto !== undefined) {
    try {
      data.valorPrevisto = deCentavos(paraCentavos(patch.valorPrevisto));
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
  }
  if (patch.vencimento !== undefined) {
    try {
      data.vencimento = diaParaData(patch.vencimento);
    } catch {
      return { ok: false, motivo: "data_invalida" };
    }
  }
  await db.parcela.updateMany({ where: { id: parcelaId }, data });
  return { ok: true };
}

export async function removerParcela(lojaId: string, parcelaId: string): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const p = await db.parcela.findUnique({
    where: { id: parcelaId },
    select: { status: true, contrato: { select: { status: true } } },
  });
  if (!p) return { ok: false, motivo: "parcela_invalida" };
  if (p.contrato.status !== "ATIVO") return { ok: false, motivo: "contrato_nao_ativo" };
  if (p.status !== "PREVISTA") return { ok: false, motivo: "nao_previsto" };
  await db.parcela.deleteMany({ where: { id: parcelaId } });
  return { ok: true };
}

// — Baixa / estorno —

export async function registrarRecebimento(
  lojaId: string,
  parcelaId: string,
  input: { valor?: string; data?: string; forma?: string },
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const p = await db.parcela.findUnique({
    where: { id: parcelaId },
    select: { status: true, valorPrevisto: true, contrato: { select: { status: true } } },
  });
  if (!p) return { ok: false, motivo: "parcela_invalida" };
  if (p.contrato.status !== "ATIVO") return { ok: false, motivo: "contrato_nao_ativo" };
  if (p.status !== "PREVISTA") return { ok: false, motivo: "nao_previsto" };

  let valorC = decParaCentavos(p.valorPrevisto);
  if (input.valor && input.valor.trim() !== "") {
    try {
      valorC = paraCentavos(input.valor);
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
  }
  if (valorC <= 0) return { ok: false, motivo: "valor_invalido" }; // baixa fantasma de R$0
  let recebidoEm: Date;
  try {
    recebidoEm = input.data && input.data.trim() !== "" ? diaParaData(input.data) : hojeUTC();
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  let forma: FormaPagamento | null = null;
  const fr = input.forma?.trim();
  if (fr) {
    if (!formaValida(fr)) return { ok: false, motivo: "forma_invalida" };
    forma = fr; // narrowed para FormaPagamento pelo type-guard
  }
  await db.parcela.updateMany({
    where: { id: parcelaId },
    data: { status: "PAGA", valorRecebido: deCentavos(valorC), recebidoEm, formaRecebimento: forma },
  });
  return { ok: true };
}

export async function estornarRecebimento(lojaId: string, parcelaId: string): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const p = await db.parcela.findUnique({ where: { id: parcelaId }, select: { status: true } });
  if (!p) return { ok: false, motivo: "parcela_invalida" };
  if (p.status !== "PAGA") return { ok: false, motivo: "nao_pago" };
  await db.parcela.updateMany({
    where: { id: parcelaId },
    data: { status: "PREVISTA", valorRecebido: null, recebidoEm: null, formaRecebimento: null },
  });
  return { ok: true };
}

// — Leitura —

export type ParcelaView = {
  id: string;
  numero: number;
  descricao: string | null;
  valorPrevisto: string;
  vencimento: Date;
  status: ParcelaStatus;
  valorRecebido: string | null;
  recebidoEm: Date | null;
  formaRecebimento: FormaPagamento | null;
  atrasada: boolean;
};

export async function listarParcelasDoContrato(lojaId: string, contratoId: string): Promise<ParcelaView[]> {
  const hoje = hojeUTC().getTime();
  const rows = await tenantPrisma(prisma, lojaId).parcela.findMany({
    where: { contratoId },
    orderBy: [{ numero: "asc" }, { vencimento: "asc" }],
  });
  return rows.map((p) => ({
    id: p.id,
    numero: p.numero,
    descricao: p.descricao,
    valorPrevisto: decParaString(p.valorPrevisto),
    vencimento: p.vencimento,
    status: p.status,
    valorRecebido: decParaStringN(p.valorRecebido),
    recebidoEm: p.recebidoEm,
    formaRecebimento: p.formaRecebimento,
    atrasada: ehAtrasada(p.status, p.vencimento, hoje),
  }));
}

export type FiltroReceber = "abertas" | "atrasadas" | "recebidas" | "todas";

export type ContaReceberView = {
  id: string;
  contratoId: string;
  leadId: string;
  noivaNome: string | null;
  descricao: string | null;
  valorPrevisto: string;
  vencimento: Date;
  status: ParcelaStatus;
  atrasada: boolean;
};

export async function listarContasAReceber(
  lojaId: string,
  opts: { filtro?: FiltroReceber; intervalo?: { gte: Date; lt: Date }; pagina?: number | string; tamanho?: number } = {},
): Promise<{ itens: ContaReceberView[]; total: number }> {
  const hoje = hojeUTC();
  const filtro = opts.filtro ?? "abertas";
  const status =
    filtro === "recebidas"
      ? { status: "PAGA" as const }
      : filtro === "abertas" || filtro === "atrasadas"
        ? { status: "PREVISTA" as const }
        : { status: { not: "CANCELADA" as const } }; // "todas": tudo menos as canceladas
  // "atrasadas" = vencido (teto = hoje); o helper intersecta com o intervalo (lt mais restritivo).
  const vencimento = vencimentoNaJanela(opts.intervalo, filtro === "atrasadas" ? hoje : undefined);
  const where = vencimento ? { ...status, vencimento } : status;
  const { skip, take } = paginar(opts.pagina, opts.tamanho);
  const db = tenantPrisma(prisma, lojaId);
  const [rows, total] = await Promise.all([
    db.parcela.findMany({
      where,
      orderBy: { vencimento: "asc" },
      include: { contrato: { select: { leadId: true, lead: { select: { noivaNome: true } } } } },
      skip,
      take,
    }),
    db.parcela.count({ where }),
  ]);
  const h = hoje.getTime();
  const itens = rows.map((p) => ({
    id: p.id,
    contratoId: p.contratoId,
    leadId: p.contrato.leadId,
    noivaNome: p.contrato.lead?.noivaNome ?? null,
    descricao: p.descricao,
    valorPrevisto: decParaString(p.valorPrevisto),
    vencimento: p.vencimento,
    status: p.status,
    atrasada: ehAtrasada(p.status, p.vencimento, h),
  }));
  return { itens, total };
}

export type ResumoReceber = { totalAReceber: string; recebidoTotal: string; emAtraso: string };

export async function resumoReceber(
  lojaId: string,
  opts: { intervalo?: { gte: Date; lt: Date } } = {},
): Promise<ResumoReceber> {
  const db = tenantPrisma(prisma, lojaId);
  const hoje = hojeUTC();
  // Intervalo escopa os totais por vencimento; "em atraso" ainda exige < hoje (teto).
  const venc = vencimentoNaJanela(opts.intervalo);
  const vencAtraso = vencimentoNaJanela(opts.intervalo, hoje);
  const [aReceber, recebido, atraso] = await Promise.all([
    db.parcela.aggregate({
      where: { status: "PREVISTA", ...(venc ? { vencimento: venc } : {}) },
      _sum: { valorPrevisto: true },
    }),
    db.parcela.aggregate({
      where: { status: "PAGA", ...(venc ? { vencimento: venc } : {}) },
      _sum: { valorRecebido: true },
    }),
    db.parcela.aggregate({ where: { status: "PREVISTA", vencimento: vencAtraso }, _sum: { valorPrevisto: true } }),
  ]);
  return {
    totalAReceber: deCentavos(decParaCentavos(aReceber._sum.valorPrevisto)),
    recebidoTotal: deCentavos(decParaCentavos(recebido._sum.valorRecebido)),
    emAtraso: deCentavos(decParaCentavos(atraso._sum.valorPrevisto)),
  };
}
