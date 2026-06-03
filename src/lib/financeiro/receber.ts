// src/lib/financeiro/receber.ts
// Contas a RECEBER — o plano de pagamento (parcelas) que nasce do contrato (S4). Gerar
// plano, dar baixa (registrar recebimento) / estornar, carteira e resumo. ATRASADA é
// DERIVADO (vencido + PREVISTA), nunca gravado. Dinheiro em centavos (util compartilhado);
// tudo escopado por loja. Decisão: docs/.../2026-06-03-s4-contas-a-receber-design.md.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { paraCentavos, deCentavos, decParaCentavos } from "@/lib/dinheiro";
import type { ParcelaStatus } from "@/generated/prisma/client";

const DIA_MS = 86_400_000;

function hojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

// "YYYY-MM-DD" → meia-noite UTC; lança se inválida.
function diaParaData(s: string): Date {
  const t = (s ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error("data inválida");
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("data inválida");
  return d;
}

const atrasadaDe = (status: ParcelaStatus, vencimento: Date, hoje: number) =>
  status === "PREVISTA" && vencimento.getTime() < hoje;

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

  const n = Math.trunc(input.numParcelas);
  if (!Number.isInteger(n) || n < 1 || n > 360) return { ok: false, motivo: "num_invalido" };

  let venc0: Date;
  try {
    venc0 = diaParaData(input.primeiroVencimento);
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  const periodicidade = Math.trunc(input.periodicidadeDias ?? 30);
  if (periodicidade < 1 || periodicidade > 3650) return { ok: false, motivo: "num_invalido" };

  const totalC = decParaCentavos(contrato.valorTotal);
  let entradaC = 0;
  if (input.entrada && input.entrada.trim() !== "") {
    try {
      entradaC = paraCentavos(input.entrada);
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
  }
  if (entradaC > totalC) return { ok: false, motivo: "entrada_maior" };

  const restanteC = totalC - entradaC;
  const base = Math.floor(restanteC / n);
  const resto = restanteC - base * n; // a ÚLTIMA parcela absorve o resto (sem drift)

  const linhas: { numero: number; descricao: string; valor: number; vencimento: Date }[] = [];
  if (entradaC > 0) linhas.push({ numero: 0, descricao: "Entrada", valor: entradaC, vencimento: venc0 });
  const startMonth = entradaC > 0 ? 1 : 0;
  for (let i = 1; i <= n; i++) {
    const valor = base + (i === n ? resto : 0);
    const vencimento = new Date(venc0.getTime() + (startMonth + (i - 1)) * periodicidade * DIA_MS);
    linhas.push({ numero: i, descricao: `Parcela ${i}/${n}`, valor, vencimento });
  }

  // createMany = inserção ATÔMICA (sem plano parcial se algo falhar no meio). O tenant
  // guard carimba lojaId em cada linha.
  await db.parcela.createMany({
    data: linhas.map((l) => ({
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
  | { ok: false; motivo: "parcela_invalida" | "nao_previsto" | "nao_pago" | "valor_invalido" | "data_invalida" | "contrato_nao_ativo" };

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
  await db.parcela.updateMany({
    where: { id: parcelaId },
    data: { status: "PAGA", valorRecebido: deCentavos(valorC), recebidoEm, formaRecebimento: input.forma?.trim() || null },
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
  formaRecebimento: string | null;
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
    valorPrevisto: Number(p.valorPrevisto).toFixed(2),
    vencimento: p.vencimento,
    status: p.status,
    valorRecebido: p.valorRecebido != null ? Number(p.valorRecebido).toFixed(2) : null,
    recebidoEm: p.recebidoEm,
    formaRecebimento: p.formaRecebimento,
    atrasada: atrasadaDe(p.status, p.vencimento, hoje),
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

export async function listarContasAReceber(lojaId: string, opts: { filtro?: FiltroReceber } = {}): Promise<ContaReceberView[]> {
  const hoje = hojeUTC();
  const filtro = opts.filtro ?? "abertas";
  const where =
    filtro === "recebidas"
      ? { status: "PAGA" as const }
      : filtro === "atrasadas"
        ? { status: "PREVISTA" as const, vencimento: { lt: hoje } }
        : filtro === "abertas"
          ? { status: "PREVISTA" as const }
          : {};
  const rows = await tenantPrisma(prisma, lojaId).parcela.findMany({
    where,
    orderBy: { vencimento: "asc" },
    include: { contrato: { select: { leadId: true, lead: { select: { noivaNome: true } } } } },
  });
  const h = hoje.getTime();
  return rows.map((p) => ({
    id: p.id,
    contratoId: p.contratoId,
    leadId: p.contrato.leadId,
    noivaNome: p.contrato.lead?.noivaNome ?? null,
    descricao: p.descricao,
    valorPrevisto: Number(p.valorPrevisto).toFixed(2),
    vencimento: p.vencimento,
    status: p.status,
    atrasada: atrasadaDe(p.status, p.vencimento, h),
  }));
}

export type ResumoReceber = { totalAReceber: string; recebidoTotal: string; emAtraso: string };

export async function resumoReceber(lojaId: string): Promise<ResumoReceber> {
  const db = tenantPrisma(prisma, lojaId);
  const hoje = hojeUTC();
  const [aReceber, recebido, atraso] = await Promise.all([
    db.parcela.aggregate({ where: { status: "PREVISTA" }, _sum: { valorPrevisto: true } }),
    db.parcela.aggregate({ where: { status: "PAGA" }, _sum: { valorRecebido: true } }),
    db.parcela.aggregate({ where: { status: "PREVISTA", vencimento: { lt: hoje } }, _sum: { valorPrevisto: true } }),
  ]);
  return {
    totalAReceber: deCentavos(decParaCentavos(aReceber._sum.valorPrevisto)),
    recebidoTotal: deCentavos(decParaCentavos(recebido._sum.valorRecebido)),
    emAtraso: deCentavos(decParaCentavos(atraso._sum.valorPrevisto)),
  };
}
