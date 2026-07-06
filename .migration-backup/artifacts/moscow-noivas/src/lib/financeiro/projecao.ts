// src/lib/financeiro/projecao.ts
// Projeção de caixa: a partir de um saldo de partida (centavos), aplica os eventos
// previstos por dia e devolve a curva dia a dia, o menor saldo e o primeiro dia negativo.
// montarCurva é PURA (testável isolada). projecaoCaixa (abaixo) lê parcelas/contas.
import { deCentavos, decParaCentavos } from "@/lib/dinheiro";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC, ymd } from "@/lib/tempo";
import { resumoReceber } from "@/lib/financeiro/receber";
import { resumoPagar } from "@/lib/financeiro/pagar";
import { saldoDeHoje, type Ancora } from "@/lib/financeiro/saldo-referencia";

export type EventoDia = { ymd: string; data: Date; entradasC: number; saidasC: number };
export type LinhaCurva = { data: Date; entradas: string; saidas: string; saldoApos: string };
export type Curva = {
  linhas: LinhaCurva[];
  menorSaldo: { data: Date | null; valor: string }; // data null = hoje (o saldo de partida é o piso)
  diaNegativo: Date | null; // primeiro dia com saldo < 0; null se nunca
};

/** Aplica os eventos (agrupados por dia) sobre o saldo de hoje em centavos. Puro. */
export function montarCurva(saldoHojeC: number, eventos: EventoDia[]): Curva {
  // Agrupa por dia somando entradas/saídas do mesmo dia.
  const porDia = new Map<string, { data: Date; entradasC: number; saidasC: number }>();
  for (const e of eventos) {
    const d = porDia.get(e.ymd);
    if (d) { d.entradasC += e.entradasC; d.saidasC += e.saidasC; }
    else porDia.set(e.ymd, { data: e.data, entradasC: e.entradasC, saidasC: e.saidasC });
  }
  const ordenados = [...porDia.values()].sort((a, b) => a.data.getTime() - b.data.getTime());

  let saldoC = saldoHojeC;
  let menorC = saldoHojeC; // o piso começa no saldo de partida
  let menorData: Date | null = null;
  let diaNegativo: Date | null = null;

  const linhas: LinhaCurva[] = ordenados.map((e) => {
    saldoC += e.entradasC - e.saidasC;
    if (saldoC < menorC) { menorC = saldoC; menorData = e.data; }
    if (diaNegativo === null && saldoC < 0) diaNegativo = e.data;
    return { data: e.data, entradas: deCentavos(e.entradasC), saidas: deCentavos(e.saidasC), saldoApos: deCentavos(saldoC) };
  });

  return { linhas, menorSaldo: { data: menorData, valor: deCentavos(menorC) }, diaNegativo };
}

export type EmAtraso = { aReceber: string; aPagar: string };
export type Projecao = {
  saldoHoje: string | null;
  ancora: Ancora | null;
  emAtraso: EmAtraso;
  curva: Curva;
  horizonteDias: number;
};

const HORIZONTES = [30, 60, 90] as const;
export type Horizonte = (typeof HORIZONTES)[number];

/** Normaliza o horizonte da querystring para 30/60/90 (default 90). */
export function normalizarHorizonte(raw: string | number | undefined): Horizonte {
  const n = Number(raw);
  return (HORIZONTES as readonly number[]).includes(n) ? (n as Horizonte) : 90;
}

/**
 * Projeção de caixa: saldo de hoje (da âncora) + curva dia a dia do que vence em
 * [hoje, hoje+H]. Vencidos em aberto NÃO entram na curva — vão para emAtraso (totais
 * dos resumos de receber/pagar). Sem âncora, saldoHoje=null e a curva monta sobre 0.
 */
export async function projecaoCaixa(lojaId: string, opts: { horizonteDias?: number } = {}): Promise<Projecao> {
  const horizonteDias = normalizarHorizonte(opts.horizonteDias);
  const db = tenantPrisma(prisma, lojaId);
  const gte = hojeUTC(); // inclui vencimentos de hoje (não são atraso)
  const lt = new Date(gte.getTime());
  lt.setUTCDate(lt.getUTCDate() + horizonteDias + 1); // até hoje+H inclusive

  const [{ valor: saldoHoje, ancora }, parcelas, contas, rec, pag] = await Promise.all([
    saldoDeHoje(lojaId),
    db.parcela.findMany({ where: { status: "PREVISTA", vencimento: { gte, lt } }, select: { vencimento: true, valorPrevisto: true } }),
    db.contaPagar.findMany({ where: { status: "PREVISTA", vencimento: { gte, lt } }, select: { vencimento: true, valorPrevisto: true } }),
    resumoReceber(lojaId),
    resumoPagar(lojaId),
  ]);

  const eventos: EventoDia[] = [
    ...parcelas.map((p) => ({ ymd: ymd(p.vencimento)!, data: p.vencimento, entradasC: decParaCentavos(p.valorPrevisto), saidasC: 0 })),
    ...contas.map((c) => ({ ymd: ymd(c.vencimento)!, data: c.vencimento, entradasC: 0, saidasC: decParaCentavos(c.valorPrevisto) })),
  ];

  const saldoHojeC = saldoHoje == null ? 0 : decParaCentavos(saldoHoje);
  return {
    saldoHoje,
    ancora,
    emAtraso: { aReceber: rec.emAtraso, aPagar: pag.emAtraso },
    curva: montarCurva(saldoHojeC, eventos),
    horizonteDias,
  };
}
