// src/lib/financeiro/pagar.ts
// Contas a PAGAR (S5) — obrigação × quitação. ContaPagar = obrigação prevista (despesa,
// fornecedor, salário, comissão); Pagamento = saída de caixa que quita N contas de uma
// vez (cruzamento salário+comissão), transacional. Motor de recorrência de salário gera
// a folha do mês (idempotente). ATRASADA é derivado. Dinheiro em centavos; tenant-scoped.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { paraCentavos, deCentavos, decParaCentavos } from "@/lib/dinheiro";
import { hojeUTC, diaParaData, competenciaValida } from "@/lib/financeiro/datas";
import { ehAtrasada } from "@/lib/financeiro/obrigacao";
import { vencimentoNaJanela } from "@/lib/financeiro/intervalo";
import { paginar } from "@/lib/paginacao";
import type { ContaPagarTipo, ContaPagarStatus } from "@/generated/prisma/client";

const TIPOS = new Set<ContaPagarTipo>(["DESPESA", "FORNECEDOR", "SALARIO", "COMISSAO"]);

async function ehMembro(lojaId: string, usuarioId: string): Promise<boolean> {
  const v = await prisma.usuarioLoja.findUnique({
    where: { usuarioId_lojaId: { usuarioId, lojaId } },
    select: { usuarioId: true },
  });
  return !!v;
}

// — Lançar conta (genérica) —

export type ResultadoConta =
  | { ok: true; contaId: string }
  | { ok: false; motivo: "tipo_invalido" | "valor_invalido" | "data_invalida" | "colaborador_invalido" | "sem_descricao" };

export async function lancarConta(
  lojaId: string,
  input: {
    tipo: ContaPagarTipo;
    colaboradorId?: string | null;
    competencia?: string | null;
    descricao: string;
    categoria?: string | null;
    fornecedor?: string | null;
    valorPrevisto: string;
    vencimento: string;
  },
): Promise<ResultadoConta> {
  if (!TIPOS.has(input.tipo)) return { ok: false, motivo: "tipo_invalido" };
  const descricao = input.descricao.trim();
  if (!descricao) return { ok: false, motivo: "sem_descricao" };
  if (input.tipo === "SALARIO" || input.tipo === "COMISSAO") {
    // Conta de folha exige um colaborador válido (membro): senão vira obrigação órfã,
    // contada no "a pagar" mas ausente da folha por competência (filtra colaboradorId).
    if (!input.colaboradorId || !(await ehMembro(lojaId, input.colaboradorId)))
      return { ok: false, motivo: "colaborador_invalido" };
  }
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
  const criada = await tenantPrisma(prisma, lojaId).contaPagar.create({
    data: {
      tipo: input.tipo,
      colaboradorId: input.colaboradorId ?? null,
      competencia: input.competencia?.trim() || null,
      descricao,
      categoria: input.categoria?.trim() || null,
      fornecedor: input.fornecedor?.trim() || null,
      valorPrevisto: deCentavos(valor),
      vencimento: venc,
    } as never,
  });
  return { ok: true, contaId: criada.id };
}

export type ResultadoOp =
  | { ok: true }
  | { ok: false; motivo: "conta_invalida" | "nao_previsto" | "valor_invalido" | "data_invalida" };

export async function editarConta(
  lojaId: string,
  contaId: string,
  patch: { descricao?: string; categoria?: string; fornecedor?: string; valorPrevisto?: string; vencimento?: string },
): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const c = await db.contaPagar.findUnique({ where: { id: contaId }, select: { status: true } });
  if (!c) return { ok: false, motivo: "conta_invalida" };
  if (c.status !== "PREVISTA") return { ok: false, motivo: "nao_previsto" };
  const data: Record<string, unknown> = {};
  if (patch.descricao !== undefined) {
    const d = patch.descricao.trim();
    if (!d) return { ok: false, motivo: "valor_invalido" };
    data.descricao = d;
  }
  if (patch.categoria !== undefined) data.categoria = patch.categoria.trim() || null;
  if (patch.fornecedor !== undefined) data.fornecedor = patch.fornecedor.trim() || null;
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
  await db.contaPagar.updateMany({ where: { id: contaId }, data });
  return { ok: true };
}

export async function removerConta(lojaId: string, contaId: string): Promise<ResultadoOp> {
  const db = tenantPrisma(prisma, lojaId);
  const c = await db.contaPagar.findUnique({ where: { id: contaId }, select: { status: true } });
  if (!c) return { ok: false, motivo: "conta_invalida" };
  if (c.status !== "PREVISTA") return { ok: false, motivo: "nao_previsto" };
  await db.contaPagar.deleteMany({ where: { id: contaId } });
  return { ok: true };
}

// — Salário recorrente (motor de recorrência) —

export type ResultadoSalario = { ok: true } | { ok: false; motivo: "colaborador_invalido" | "valor_invalido" | "dia_invalido" };

export async function definirSalarioRecorrente(
  lojaId: string,
  colaboradorId: string,
  input: { valorBase: string; diaVencimento: number },
): Promise<ResultadoSalario> {
  if (!(await ehMembro(lojaId, colaboradorId))) return { ok: false, motivo: "colaborador_invalido" };
  const dia = Math.trunc(input.diaVencimento);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) return { ok: false, motivo: "dia_invalido" };
  let valor: number;
  try {
    valor = paraCentavos(input.valorBase);
  } catch {
    return { ok: false, motivo: "valor_invalido" };
  }
  const db = tenantPrisma(prisma, lojaId);
  const existente = await db.salarioRecorrente.findFirst({ where: { colaboradorId }, select: { id: true } });
  if (existente) {
    await db.salarioRecorrente.updateMany({ where: { id: existente.id }, data: { valorBase: deCentavos(valor), diaVencimento: dia, ativo: true } });
  } else {
    await db.salarioRecorrente.create({ data: { colaboradorId, valorBase: deCentavos(valor), diaVencimento: dia } as never });
  }
  return { ok: true };
}

export async function removerSalarioRecorrente(lojaId: string, id: string): Promise<ResultadoOp> {
  await tenantPrisma(prisma, lojaId).salarioRecorrente.deleteMany({ where: { id } });
  return { ok: true };
}

export type SalarioRecorrenteView = { id: string; colaboradorId: string; colaboradorNome: string; valorBase: string; diaVencimento: number; ativo: boolean };

export async function listarSalariosRecorrentes(lojaId: string): Promise<SalarioRecorrenteView[]> {
  const rows = await tenantPrisma(prisma, lojaId).salarioRecorrente.findMany({
    orderBy: { createdAt: "asc" },
    include: { colaborador: { select: { nome: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    colaboradorId: s.colaboradorId,
    colaboradorNome: s.colaborador.nome,
    valorBase: Number(s.valorBase).toFixed(2),
    diaVencimento: s.diaVencimento,
    ativo: s.ativo,
  }));
}

export type ResultadoFolha = { ok: true; geradas: number } | { ok: false; motivo: "competencia_invalida" };

/** Gera a folha do mês: 1 ContaPagar SALARIO por recorrência ativa. Idempotente: pula
 *  colaboradores que já têm conta SALARIO naquela competência. */
export async function gerarFolhaDoMes(lojaId: string, competencia: string): Promise<ResultadoFolha> {
  if (!competenciaValida(competencia)) return { ok: false, motivo: "competencia_invalida" };
  const db = tenantPrisma(prisma, lojaId);
  const [recorrencias, jaFeitas] = await Promise.all([
    db.salarioRecorrente.findMany({ where: { ativo: true } }),
    db.contaPagar.findMany({ where: { tipo: "SALARIO", competencia }, select: { colaboradorId: true } }),
  ]);
  const feitos = new Set(jaFeitas.map((c) => c.colaboradorId));
  const novas = recorrencias.filter((r) => !feitos.has(r.colaboradorId));
  if (novas.length === 0) return { ok: true, geradas: 0 };

  await db.contaPagar.createMany({
    data: novas.map((r) => ({
      tipo: "SALARIO" as const,
      colaboradorId: r.colaboradorId,
      competencia,
      descricao: `Salário ${competencia}`,
      valorPrevisto: Number(r.valorBase).toFixed(2),
      vencimento: diaParaData(`${competencia}-${String(r.diaVencimento).padStart(2, "0")}`),
      salarioRecorrenteId: r.id,
    })) as never,
  });
  return { ok: true, geradas: novas.length };
}

// — Pagamento (quita N contas, transacional) —

class PagamentoErro extends Error {
  constructor(public motivo: string) {
    super(motivo);
  }
}

export type ResultadoPagamento =
  | { ok: true; pagamentoId: string }
  | { ok: false; motivo: "vazio" | "conta_invalida" | "nao_previsto" | "valor_invalido" | "data_invalida" };

export async function registrarPagamento(
  lojaId: string,
  input: { colaboradorId?: string | null; data: string; forma?: string | null; itens: { contaPagarId: string; valor: string }[] },
): Promise<ResultadoPagamento> {
  if (!input.itens || input.itens.length === 0) return { ok: false, motivo: "vazio" };
  let dataPg: Date;
  try {
    dataPg = diaParaData(input.data);
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }
  // Parse valores (centavos) — todos > 0.
  const itensC: { contaPagarId: string; valorC: number }[] = [];
  for (const it of input.itens) {
    let v: number;
    try {
      v = paraCentavos(it.valor);
    } catch {
      return { ok: false, motivo: "valor_invalido" };
    }
    if (v <= 0) return { ok: false, motivo: "valor_invalido" };
    itensC.push({ contaPagarId: it.contaPagarId, valorC: v });
  }
  const ids = itensC.map((i) => i.contaPagarId);
  const valorPagoC = itensC.reduce((s, i) => s + i.valorC, 0);

  try {
    // Transação no client BASE com lojaId explícito (tudo-ou-nada).
    const pagamentoId = await prisma.$transaction(async (tx) => {
      // Quando o pagamento é de um colaborador, as contas TÊM de ser dele — senão um
      // item forjado quitaria a conta de outra pessoa dentro deste pagamento (spec §6).
      const contas = await tx.contaPagar.findMany({
        where: { id: { in: ids }, lojaId, ...(input.colaboradorId ? { colaboradorId: input.colaboradorId } : {}) },
        select: { id: true, status: true },
      });
      if (contas.length !== new Set(ids).size) throw new PagamentoErro("conta_invalida");
      if (contas.some((c) => c.status !== "PREVISTA")) throw new PagamentoErro("nao_previsto");

      const pag = await tx.pagamento.create({
        data: { lojaId, colaboradorId: input.colaboradorId ?? null, data: dataPg, valorPago: deCentavos(valorPagoC), forma: input.forma?.trim() || null },
      });
      await tx.pagamentoItem.createMany({
        data: itensC.map((i) => ({ lojaId, pagamentoId: pag.id, contaPagarId: i.contaPagarId, valor: deCentavos(i.valorC) })),
      });
      await tx.contaPagar.updateMany({ where: { id: { in: ids }, lojaId }, data: { status: "PAGA" } });
      return pag.id;
    });
    return { ok: true, pagamentoId };
  } catch (e) {
    if (e instanceof PagamentoErro) return { ok: false, motivo: e.motivo as ResultadoPagamento extends { ok: false; motivo: infer M } ? M : never };
    // P2002 no contaPagarId @unique = conta já quitada por outro pagamento.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return { ok: false, motivo: "nao_previsto" };
    throw e;
  }
}

export async function estornarPagamento(lojaId: string, pagamentoId: string): Promise<{ ok: true } | { ok: false; motivo: "pagamento_invalido" }> {
  const pag = await tenantPrisma(prisma, lojaId).pagamento.findUnique({
    where: { id: pagamentoId },
    select: { id: true, itens: { select: { contaPagarId: true } } },
  });
  if (!pag) return { ok: false, motivo: "pagamento_invalido" };
  const contaIds = pag.itens.map((i) => i.contaPagarId);
  await prisma.$transaction(async (tx) => {
    if (contaIds.length > 0) await tx.contaPagar.updateMany({ where: { id: { in: contaIds }, lojaId }, data: { status: "PREVISTA" } });
    await tx.pagamento.deleteMany({ where: { id: pagamentoId, lojaId } }); // cascade apaga os itens
  });
  return { ok: true };
}

export async function marcarEnviadoContabilidade(lojaId: string, pagamentoId: string, enviado: boolean): Promise<{ ok: true } | { ok: false; motivo: "pagamento_invalido" }> {
  const db = tenantPrisma(prisma, lojaId);
  const pag = await db.pagamento.findUnique({ where: { id: pagamentoId }, select: { id: true, enviadoContabilidadeEm: true } });
  if (!pag) return { ok: false, motivo: "pagamento_invalido" };
  // Re-marcar como enviado NÃO sobrescreve o carimbo original (preserva a data do envio).
  if (enviado && pag.enviadoContabilidadeEm !== null) return { ok: true };
  await db.pagamento.updateMany({ where: { id: pagamentoId }, data: { enviadoContabilidadeEm: enviado ? new Date() : null } });
  return { ok: true };
}

// — Leitura —

export type FiltroPagar = "abertas" | "atrasadas" | "pagas" | "todas";

export type ContaPagarView = {
  id: string;
  tipo: ContaPagarTipo;
  colaboradorId: string | null;
  colaboradorNome: string | null;
  competencia: string | null;
  descricao: string;
  categoria: string | null;
  fornecedor: string | null;
  valorPrevisto: string;
  vencimento: Date;
  status: ContaPagarStatus;
  atrasada: boolean;
  pagamentoId: string | null; // se paga, o pagamento que a quitou (p/ estorno)
};

export async function listarContasAPagar(
  lojaId: string,
  opts: { filtro?: FiltroPagar; tipo?: ContaPagarTipo; colaboradorId?: string; intervalo?: { gte: Date; lt: Date }; pagina?: number | string; tamanho?: number } = {},
): Promise<{ itens: ContaPagarView[]; total: number }> {
  const hoje = hojeUTC();
  const filtro = opts.filtro ?? "abertas";
  const base: Record<string, unknown> = {};
  if (opts.tipo) base.tipo = opts.tipo;
  if (opts.colaboradorId) base.colaboradorId = opts.colaboradorId;
  if (filtro === "pagas") base.status = "PAGA";
  else if (filtro === "abertas" || filtro === "atrasadas") base.status = "PREVISTA";
  // "atrasadas" = vencido (teto = hoje); o helper intersecta com o intervalo (lt mais restritivo).
  const vencimento = vencimentoNaJanela(opts.intervalo, filtro === "atrasadas" ? hoje : undefined);
  if (vencimento) base.vencimento = vencimento;
  const { skip, take } = paginar(opts.pagina, opts.tamanho);
  const db = tenantPrisma(prisma, lojaId);
  const [rows, total] = await Promise.all([
    db.contaPagar.findMany({
      where: base,
      orderBy: { vencimento: "asc" },
      include: { colaborador: { select: { nome: true } }, itemPagto: { select: { pagamentoId: true } } },
      skip,
      take,
    }),
    db.contaPagar.count({ where: base }),
  ]);
  const h = hoje.getTime();
  const itens = rows.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    colaboradorId: c.colaboradorId,
    colaboradorNome: c.colaborador?.nome ?? null,
    competencia: c.competencia,
    descricao: c.descricao,
    categoria: c.categoria,
    fornecedor: c.fornecedor,
    valorPrevisto: Number(c.valorPrevisto).toFixed(2),
    vencimento: c.vencimento,
    status: c.status,
    atrasada: ehAtrasada(c.status, c.vencimento, h),
    pagamentoId: c.itemPagto?.pagamentoId ?? null,
  }));
  return { itens, total };
}

export type PagamentoView = {
  id: string;
  data: Date;
  valorPago: string;
  forma: string | null;
  colaboradorId: string | null;
  colaboradorNome: string | null;
  enviadoContabilidade: boolean;
  contas: { descricao: string; valor: string }[];
};

/** Pagamentos da loja (mais recentes primeiro), opcionalmente de um colaborador — p/ a
 *  conferência da folha e o envio à contabilidade. */
export async function listarPagamentos(
  lojaId: string,
  opts: { colaboradorId?: string; pagina?: number | string; tamanho?: number } = {},
): Promise<{ itens: PagamentoView[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (opts.colaboradorId) where.colaboradorId = opts.colaboradorId;
  const { skip, take } = paginar(opts.pagina, opts.tamanho);
  const db = tenantPrisma(prisma, lojaId);
  const [rows, total] = await Promise.all([
    db.pagamento.findMany({
      where,
      orderBy: { data: "desc" },
      include: { colaborador: { select: { nome: true } }, itens: { include: { contaPagar: { select: { descricao: true } } } } },
      skip,
      take,
    }),
    db.pagamento.count({ where }),
  ]);
  const itens = rows.map((p) => ({
    id: p.id,
    data: p.data,
    valorPago: Number(p.valorPago).toFixed(2),
    forma: p.forma,
    colaboradorId: p.colaboradorId,
    colaboradorNome: p.colaborador?.nome ?? null,
    enviadoContabilidade: p.enviadoContabilidadeEm !== null,
    contas: p.itens.map((i) => ({ descricao: i.contaPagar.descricao, valor: Number(i.valor).toFixed(2) })),
  }));
  return { itens, total };
}

export type ResumoPagar = { totalAPagar: string; pagoTotal: string; emAtraso: string };

export async function resumoPagar(lojaId: string, opts: { intervalo?: { gte: Date; lt: Date } } = {}): Promise<ResumoPagar> {
  const db = tenantPrisma(prisma, lojaId);
  const hoje = hojeUTC();
  // Intervalo escopa os totais por vencimento; "em atraso" ainda exige < hoje (teto).
  const venc = vencimentoNaJanela(opts.intervalo);
  const vencAtraso = vencimentoNaJanela(opts.intervalo, hoje);
  const [aPagar, pago, atraso] = await Promise.all([
    db.contaPagar.aggregate({ where: { status: "PREVISTA", ...(venc ? { vencimento: venc } : {}) }, _sum: { valorPrevisto: true } }),
    // O "pago" não tem vencimento na saída de caixa; com janela, somamos os ITENS de
    // pagamento cuja conta quitada vence dentro dela (evita dupla contagem do valorPago).
    venc
      ? db.pagamentoItem.aggregate({ where: { contaPagar: { vencimento: venc } }, _sum: { valor: true } })
      : db.pagamento.aggregate({ _sum: { valorPago: true } }),
    db.contaPagar.aggregate({ where: { status: "PREVISTA", vencimento: vencAtraso }, _sum: { valorPrevisto: true } }),
  ]);
  const pagoSoma = venc
    ? (pago as { _sum: { valor: Parameters<typeof decParaCentavos>[0] } })._sum.valor
    : (pago as { _sum: { valorPago: Parameters<typeof decParaCentavos>[0] } })._sum.valorPago;
  return {
    totalAPagar: deCentavos(decParaCentavos(aPagar._sum.valorPrevisto)),
    pagoTotal: deCentavos(decParaCentavos(pagoSoma)),
    emAtraso: deCentavos(decParaCentavos(atraso._sum.valorPrevisto)),
  };
}

export type ResumoColaborador = { colaboradorId: string; nome: string; salario: string; comissao: string; total: string };

/** Folha por competência: salário + comissão de cada colaborador (p/ enviar à contabilidade). */
export async function resumoPorCompetencia(lojaId: string, competencia: string): Promise<ResumoColaborador[]> {
  const rows = await tenantPrisma(prisma, lojaId).contaPagar.findMany({
    where: { competencia, tipo: { in: ["SALARIO", "COMISSAO"] }, colaboradorId: { not: null } },
    include: { colaborador: { select: { nome: true } } },
  });
  const mapa = new Map<string, { nome: string; salarioC: number; comissaoC: number }>();
  for (const c of rows) {
    const id = c.colaboradorId!;
    const cur = mapa.get(id) ?? { nome: c.colaborador?.nome ?? "—", salarioC: 0, comissaoC: 0 };
    const v = decParaCentavos(c.valorPrevisto);
    if (c.tipo === "SALARIO") cur.salarioC += v;
    else cur.comissaoC += v;
    mapa.set(id, cur);
  }
  return [...mapa.entries()].map(([colaboradorId, x]) => ({
    colaboradorId,
    nome: x.nome,
    salario: deCentavos(x.salarioC),
    comissao: deCentavos(x.comissaoC),
    total: deCentavos(x.salarioC + x.comissaoC),
  }));
}
