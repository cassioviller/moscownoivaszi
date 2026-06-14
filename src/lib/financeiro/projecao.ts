// src/lib/financeiro/projecao.ts
// Projeção de caixa: a partir de um saldo de partida (centavos), aplica os eventos
// previstos por dia e devolve a curva dia a dia, o menor saldo e o primeiro dia negativo.
// montarCurva é PURA (testável isolada). projecaoCaixa (abaixo) lê parcelas/contas.
import { deCentavos } from "@/lib/dinheiro";

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
