/**
 * Cálculo de comissão por faixas — funções puras (testáveis sem banco).
 *
 * Regra do produto (decidida em 2026-07-07): PERCENTUAL SOBRE O TOTAL — a
 * maior faixa atingida (minimoVenda <= total) define o percentual aplicado ao
 * total INTEIRO (não é progressivo por faixa).
 *
 * Estornos: a venda conta na competência do fechadoEm, salvo se o contrato foi
 * cancelado ainda dentro da mesma competência (nunca gera comissão). Contrato
 * fechado numa competência anterior e cancelado nesta subtrai o valor aqui
 * (estorno na competência do cancelamento).
 */

export interface FaixaComissao {
  minimoVenda: number;
  percentual: number;
}

export interface ResultadoComissao {
  totalVendas: number;
  percentualAplicado: number;
  comissaoValor: number;
}

/** Percentual da maior faixa atingida; 0 se nenhuma faixa alcançada. */
export function percentualParaTotal(total: number, faixas: FaixaComissao[]): number {
  let percentual = 0;
  let melhorMinimo = -Infinity;
  for (const faixa of faixas) {
    if (total >= faixa.minimoVenda && faixa.minimoVenda > melhorMinimo) {
      melhorMinimo = faixa.minimoVenda;
      percentual = faixa.percentual;
    }
  }
  return percentual;
}

/** Arredonda para centavos (evita dízimas de ponto flutuante). */
function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function calcularComissao(params: {
  vendasBrutas: number;
  estornos: number;
  faixas: FaixaComissao[];
}): ResultadoComissao {
  const totalVendas = centavos(params.vendasBrutas - params.estornos);
  if (totalVendas <= 0) {
    return { totalVendas, percentualAplicado: 0, comissaoValor: 0 };
  }
  const percentualAplicado = percentualParaTotal(totalVendas, params.faixas);
  return {
    totalVendas,
    percentualAplicado,
    comissaoValor: centavos((totalVendas * percentualAplicado) / 100),
  };
}

// ── Competência (America/Sao_Paulo, offset fixo -03:00 — sem DST desde 2019) ──
// Este módulo é puro de propósito (unit sem banco), então não importa o
// inicioDoDia de disponibilidade.ts, que arrasta os tipos de db junto.

/** Início (inclusivo) e fim (exclusivo) da competência "YYYY-MM". */
export function limitesCompetencia(competencia: string): { inicio: Date; fim: Date } {
  const [ano, mes] = competencia.split("-").map(Number);
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    inicio: new Date(`${ano}-${pad(mes)}-01T00:00:00-03:00`),
    fim: new Date(`${proximoAno}-${pad(proximoMes)}-01T00:00:00-03:00`),
  };
}

/** Vencimento da conta de comissão: dia 5 do mês seguinte à competência. */
export function vencimentoComissao(competencia: string): Date {
  const { fim } = limitesCompetencia(competencia);
  const ano = fim.toISOString().slice(0, 4);
  const mes = fim.toISOString().slice(5, 7);
  return new Date(`${ano}-${mes}-05T12:00:00-03:00`);
}
