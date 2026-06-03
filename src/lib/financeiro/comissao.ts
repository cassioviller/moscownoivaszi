// src/lib/financeiro/comissao.ts
// Motor de comissão (S6). NÚCLEO PURO (topo): aplica faixas sobre o acumulado de vendas
// — só aritmética em centavos (+ % como número, ex.: 5 = 5%); a faixa do acumulado FINAL
// rege o mês (retroativo). CAMADA COM BANCO (fundo): persiste regras, mede o acumulado
// dos contratos ATIVO da competência, e monta o preview/ranking delegando ao núcleo.
// O fechamento (grava ContaPagar) + o estorno §6.4 entram na fatia seguinte.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { paraCentavos, deCentavos, decParaCentavos } from "@/lib/dinheiro";
import { hojeUTC, diaParaData } from "@/lib/financeiro/datas";

export type FaixaCalc = {
  minAcumulado: number; // centavos — borda inferior INCLUSIVA
  maxAcumulado: number | null; // centavos — borda superior EXCLUSIVA; null = topo aberto
  percentual: number | null; // % (ex.: 5 = 5%); null/0 = faixa sem comissão de %
  bonusFixo: number | null; // centavos; null/0 = faixa sem bônus
};

export type ResultadoComissao = {
  faixaIndex: number | null; // índice (na lista ordenada) da faixa final; null se nenhuma
  percentualAplicado: number | null;
  valorComissao: number; // centavos
  valorBonus: number; // centavos
  valorTotal: number; // centavos = comissão + bônus (≥ 0)
};

const ZERO: ResultadoComissao = { faixaIndex: null, percentualAplicado: null, valorComissao: 0, valorBonus: 0, valorTotal: 0 };

export function ordenarFaixas(faixas: FaixaCalc[]): FaixaCalc[] {
  return [...faixas].sort((a, b) => a.minAcumulado - b.minAcumulado);
}

/** Aplica as faixas sobre o acumulado. Retroativo: a faixa final rege todo o acumulado.
 *  Acumulado ≤ 0 (inclui o estorno §6.4 que zera/negativa o mês) → tudo zero, sem bônus. */
export function calcularComissao(
  totalVendas: number,
  faixas: FaixaCalc[],
  bonusAcumulaFaixas: boolean,
): ResultadoComissao {
  if (totalVendas <= 0) return ZERO;
  const ord = ordenarFaixas(faixas);
  const idx = ord.findIndex(
    (f) => totalVendas >= f.minAcumulado && (f.maxAcumulado === null || totalVendas < f.maxAcumulado),
  );
  if (idx === -1) return ZERO; // abaixo da menor faixa (buraco) → sem comissão
  const faixaFinal = ord[idx];
  const pct = faixaFinal.percentual ?? null;
  const valorComissao = pct ? Math.round((totalVendas * pct) / 100) : 0;
  const atingidas = bonusAcumulaFaixas ? ord.filter((f) => f.minAcumulado <= totalVendas) : [faixaFinal];
  const valorBonus = atingidas.reduce((s, f) => s + (f.bonusFixo ?? 0), 0);
  const valorTotal = Math.max(0, valorComissao + valorBonus);
  return { faixaIndex: idx, percentualAplicado: pct, valorComissao, valorBonus, valorTotal };
}

export type ResultadoValidacao =
  | { ok: true }
  | { ok: false; motivo: "sem_faixas" | "min_negativo" | "intervalo_invalido" | "faixa_vazia" | "valor_negativo" | "aberta_no_meio" | "sobreposicao" };

/** Faixas coerentes: ≥1; cada uma com min≥0, max>min (ou aberta), % OU bônus (>0); sem
 *  sobreposição; só a faixa do topo pode ser aberta. Buracos são permitidos (intervalo
 *  sem faixa = sem comissão ali, ex.: abaixo do primeiro patamar). */
export function validarFaixas(faixas: FaixaCalc[]): ResultadoValidacao {
  if (faixas.length === 0) return { ok: false, motivo: "sem_faixas" };
  const ord = ordenarFaixas(faixas);
  for (let i = 0; i < ord.length; i++) {
    const f = ord[i];
    if (!(f.minAcumulado >= 0)) return { ok: false, motivo: "min_negativo" };
    if (f.maxAcumulado !== null && !(f.maxAcumulado > f.minAcumulado)) return { ok: false, motivo: "intervalo_invalido" };
    if ((f.percentual ?? 0) < 0 || (f.bonusFixo ?? 0) < 0) return { ok: false, motivo: "valor_negativo" };
    if ((f.percentual ?? 0) <= 0 && (f.bonusFixo ?? 0) <= 0) return { ok: false, motivo: "faixa_vazia" };
    if (f.maxAcumulado === null && i !== ord.length - 1) return { ok: false, motivo: "aberta_no_meio" };
    if (i > 0) {
      const prev = ord[i - 1];
      if (prev.maxAcumulado === null) return { ok: false, motivo: "aberta_no_meio" };
      if (f.minAcumulado < prev.maxAcumulado) return { ok: false, motivo: "sobreposicao" };
    }
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada com banco (tenant-scoped)
// ─────────────────────────────────────────────────────────────────────────────

function competenciaValida(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** Intervalo [gte, lt) de uma competência "YYYY-MM" em meia-noite UTC (convenção do sistema). */
function competenciaRange(competencia: string): { gte: Date; lt: Date } {
  const y = Number(competencia.slice(0, 4));
  const m = Number(competencia.slice(5, 7)); // 1..12
  const gte = new Date(Date.UTC(y, m - 1, 1));
  const lt = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return { gte, lt };
}

async function ehMembro(lojaId: string, usuarioId: string): Promise<boolean> {
  const v = await prisma.usuarioLoja.findUnique({
    where: { usuarioId_lojaId: { usuarioId, lojaId } },
    select: { usuarioId: true },
  });
  return !!v;
}

/** "5" | "5,5" | "5.5" → 5 / 5.5 (% com 2 casas). null/"" → null. Lança se inválido. */
function parsePercentual(s: string | null): number | null {
  if (s === null) return null;
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 999.99) throw new Error("percentual inválido");
  return Math.round(n * 100) / 100;
}

// — Regras —

export type FaixaInput = { minAcumulado: string; maxAcumulado: string | null; percentual: string | null; bonusFixo: string | null };
export type ResultadoRegra =
  | { ok: true; regraId: string }
  | { ok: false; motivo: "vendedora_invalida" | "faixas_invalidas" | "valor_invalido" | "data_invalida" };

/** Define (cria/atualiza) a regra de uma vendedora numa vigência. Valida membro + faixas. */
export async function definirRegra(
  lojaId: string,
  vendedoraId: string,
  input: { vigenciaInicio?: string; bonusAcumulaFaixas: boolean; faixas: FaixaInput[] },
): Promise<ResultadoRegra> {
  if (!(await ehMembro(lojaId, vendedoraId))) return { ok: false, motivo: "vendedora_invalida" };

  let vig: Date;
  try {
    vig = input.vigenciaInicio ? diaParaData(input.vigenciaInicio) : hojeUTC();
  } catch {
    return { ok: false, motivo: "data_invalida" };
  }

  let faixasC: FaixaCalc[];
  try {
    faixasC = input.faixas.map((f) => ({
      minAcumulado: paraCentavos(f.minAcumulado),
      maxAcumulado: f.maxAcumulado === null || f.maxAcumulado.trim() === "" ? null : paraCentavos(f.maxAcumulado),
      percentual: parsePercentual(f.percentual),
      bonusFixo: f.bonusFixo === null || f.bonusFixo.trim() === "" ? null : paraCentavos(f.bonusFixo),
    }));
  } catch {
    return { ok: false, motivo: "valor_invalido" };
  }
  if (!validarFaixas(faixasC).ok) return { ok: false, motivo: "faixas_invalidas" };

  const regraId = await prisma.$transaction(async (tx) => {
    const existente = await tx.comissaoRegra.findFirst({ where: { lojaId, vendedoraId, vigenciaInicio: vig }, select: { id: true } });
    let id: string;
    if (existente) {
      await tx.comissaoRegra.updateMany({ where: { id: existente.id, lojaId }, data: { bonusAcumulaFaixas: input.bonusAcumulaFaixas, ativo: true } });
      await tx.comissaoFaixa.deleteMany({ where: { regraId: existente.id, lojaId } });
      id = existente.id;
    } else {
      const r = await tx.comissaoRegra.create({ data: { lojaId, vendedoraId, vigenciaInicio: vig, bonusAcumulaFaixas: input.bonusAcumulaFaixas } });
      id = r.id;
    }
    await tx.comissaoFaixa.createMany({
      data: faixasC.map((f) => ({
        lojaId,
        regraId: id,
        minAcumulado: deCentavos(f.minAcumulado),
        maxAcumulado: f.maxAcumulado === null ? null : deCentavos(f.maxAcumulado),
        percentual: f.percentual === null ? null : f.percentual.toFixed(2),
        bonusFixo: f.bonusFixo === null ? null : deCentavos(f.bonusFixo),
      })),
    });
    return id;
  });
  return { ok: true, regraId };
}

export type FaixaView = { minAcumulado: string; maxAcumulado: string | null; percentual: string | null; bonusFixo: string | null };
export type RegraView = { id: string; vendedoraId: string; vendedoraNome: string; vigenciaInicio: Date; bonusAcumulaFaixas: boolean; ativo: boolean; faixas: FaixaView[] };

export async function listarRegras(lojaId: string): Promise<RegraView[]> {
  const rows = await tenantPrisma(prisma, lojaId).comissaoRegra.findMany({
    orderBy: [{ vendedoraId: "asc" }, { vigenciaInicio: "desc" }],
    include: { vendedora: { select: { nome: true } }, faixas: true },
  });
  return rows.map((r) => ({
    id: r.id,
    vendedoraId: r.vendedoraId,
    vendedoraNome: r.vendedora.nome,
    vigenciaInicio: r.vigenciaInicio,
    bonusAcumulaFaixas: r.bonusAcumulaFaixas,
    ativo: r.ativo,
    faixas: [...r.faixas]
      .sort((a, b) => Number(a.minAcumulado) - Number(b.minAcumulado))
      .map((f) => ({
        minAcumulado: Number(f.minAcumulado).toFixed(2),
        maxAcumulado: f.maxAcumulado === null ? null : Number(f.maxAcumulado).toFixed(2),
        percentual: f.percentual === null ? null : Number(f.percentual).toFixed(2),
        bonusFixo: f.bonusFixo === null ? null : Number(f.bonusFixo).toFixed(2),
      })),
  }));
}

export async function removerRegra(lojaId: string, regraId: string): Promise<{ ok: true }> {
  await tenantPrisma(prisma, lojaId).comissaoRegra.deleteMany({ where: { id: regraId } }); // cascade nas faixas
  return { ok: true };
}

// — Acumulado e regra vigente —

export type RegraVigente = { regraId: string; bonusAcumulaFaixas: boolean; faixas: FaixaCalc[] };

/** Regra ATIVA cuja vigência começou até o fim da competência, mais recente. null se nenhuma. */
export async function regraVigente(lojaId: string, vendedoraId: string, competencia: string): Promise<RegraVigente | null> {
  if (!competenciaValida(competencia)) return null;
  const { lt } = competenciaRange(competencia);
  const r = await tenantPrisma(prisma, lojaId).comissaoRegra.findFirst({
    where: { vendedoraId, ativo: true, vigenciaInicio: { lt } },
    orderBy: { vigenciaInicio: "desc" },
    include: { faixas: true },
  });
  if (!r) return null;
  return {
    regraId: r.id,
    bonusAcumulaFaixas: r.bonusAcumulaFaixas,
    faixas: r.faixas.map((f) => ({
      minAcumulado: decParaCentavos(f.minAcumulado),
      maxAcumulado: f.maxAcumulado === null ? null : decParaCentavos(f.maxAcumulado),
      percentual: f.percentual === null ? null : Number(f.percentual),
      bonusFixo: f.bonusFixo === null ? null : decParaCentavos(f.bonusFixo),
    })),
  };
}

/** Acumulado (centavos) dos contratos ATIVO da vendedora na competência (por fechadoEm). */
export async function totalVendasCentavos(lojaId: string, vendedoraId: string, competencia: string): Promise<number> {
  const { gte, lt } = competenciaRange(competencia);
  const agg = await tenantPrisma(prisma, lojaId).contrato.aggregate({
    where: { vendedoraId, status: "ATIVO", fechadoEm: { gte, lt } },
    _sum: { valorTotal: true },
  });
  return decParaCentavos(agg._sum.valorTotal);
}

// — Preview / ranking ao vivo —

export type PreviewLinha = { vendedoraId: string; nome: string; totalVendas: string; percentual: string | null; comissao: string; bonus: string; total: string };

/** Ranking ao vivo da competência: por vendedora com vendas, aplica a regra vigente. */
export async function previewComissao(lojaId: string, competencia: string): Promise<PreviewLinha[]> {
  if (!competenciaValida(competencia)) return [];
  const { gte, lt } = competenciaRange(competencia);
  const db = tenantPrisma(prisma, lojaId);
  const grupos = await db.contrato.groupBy({
    by: ["vendedoraId"],
    where: { status: "ATIVO", fechadoEm: { gte, lt } },
    _sum: { valorTotal: true },
  });
  if (grupos.length === 0) return [];
  const nomes = new Map(
    (await prisma.usuario.findMany({ where: { id: { in: grupos.map((g) => g.vendedoraId) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]),
  );
  const linhas = await Promise.all(
    grupos.map(async (g) => {
      const total = decParaCentavos(g._sum.valorTotal);
      const regra = await regraVigente(lojaId, g.vendedoraId, competencia);
      const r = regra ? calcularComissao(total, regra.faixas, regra.bonusAcumulaFaixas) : { percentualAplicado: null, valorComissao: 0, valorBonus: 0, valorTotal: 0 };
      return {
        vendedoraId: g.vendedoraId,
        nome: nomes.get(g.vendedoraId) ?? "—",
        totalVendas: deCentavos(total),
        percentual: r.percentualAplicado === null ? null : r.percentualAplicado.toFixed(2),
        comissao: deCentavos(r.valorComissao),
        bonus: deCentavos(r.valorBonus),
        total: deCentavos(r.valorTotal),
      };
    }),
  );
  return linhas.sort((a, b) => Number(b.total) - Number(a.total));
}

export type ResumoVendedora = {
  totalVendas: string;
  percentual: string | null;
  comissao: string;
  bonus: string;
  total: string;
  proximoDegrau: { faltam: string; percentual: string | null } | null;
};

/** Comissão da vendedora na competência + o próximo degrau (p/ o perfil dela). */
export async function comissaoDaVendedora(lojaId: string, vendedoraId: string, competencia: string): Promise<ResumoVendedora> {
  const total = competenciaValida(competencia) ? await totalVendasCentavos(lojaId, vendedoraId, competencia) : 0;
  const regra = await regraVigente(lojaId, vendedoraId, competencia);
  const r = regra ? calcularComissao(total, regra.faixas, regra.bonusAcumulaFaixas) : { percentualAplicado: null, valorComissao: 0, valorBonus: 0, valorTotal: 0 };
  let proximoDegrau: ResumoVendedora["proximoDegrau"] = null;
  if (regra) {
    const acima = ordenarFaixas(regra.faixas).find((f) => f.minAcumulado > total);
    if (acima) proximoDegrau = { faltam: deCentavos(acima.minAcumulado - total), percentual: acima.percentual === null ? null : acima.percentual.toFixed(2) };
  }
  return {
    totalVendas: deCentavos(total),
    percentual: r.percentualAplicado === null ? null : r.percentualAplicado.toFixed(2),
    comissao: deCentavos(r.valorComissao),
    bonus: deCentavos(r.valorBonus),
    total: deCentavos(r.valorTotal),
    proximoDegrau,
  };
}

// — Histórico de fechamentos (leitura; o fechamento em si é fatia 4) —

export type FechamentoView = {
  id: string;
  vendedoraId: string;
  vendedoraNome: string;
  competencia: string;
  totalVendas: string;
  percentualAplicado: string | null;
  valorComissao: string;
  valorBonus: string;
  valorTotal: string;
  contaPagarId: string | null;
  fechadoEm: Date;
};

export async function listarFechamentos(lojaId: string, opts: { competencia?: string } = {}): Promise<FechamentoView[]> {
  const where: Record<string, unknown> = {};
  if (opts.competencia) where.competencia = opts.competencia;
  const rows = await tenantPrisma(prisma, lojaId).comissaoFechamento.findMany({
    where,
    orderBy: [{ competencia: "desc" }, { valorTotal: "desc" }],
    include: { vendedora: { select: { nome: true } } },
  });
  return rows.map((f) => ({
    id: f.id,
    vendedoraId: f.vendedoraId,
    vendedoraNome: f.vendedora.nome,
    competencia: f.competencia,
    totalVendas: Number(f.totalVendas).toFixed(2),
    percentualAplicado: f.percentualAplicado === null ? null : Number(f.percentualAplicado).toFixed(2),
    valorComissao: Number(f.valorComissao).toFixed(2),
    valorBonus: Number(f.valorBonus).toFixed(2),
    valorTotal: Number(f.valorTotal).toFixed(2),
    contaPagarId: f.contaPagarId,
    fechadoEm: f.fechadoEm,
  }));
}
