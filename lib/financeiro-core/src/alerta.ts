import { hojeLocal } from "./datas";
import { saldoDeHoje, type AncoraSaldo } from "./saldo";
import { projetarCaixa } from "./projecao";
import type { Horizonte } from "./projecao";
import type { ObrigacaoPrevista, ParcelaPaga, SaidaCaixa } from "./caixa";

/**
 * O alerta de caixa: a projeção reduzida à única pergunta que faz alguém agir —
 * "o dinheiro acaba antes de entrar, e quando?".
 *
 * A curva inteira mora em `/financeiro/projecao`, atrás de um clique. Quem só
 * abre o dashboard nunca a vê, e o dia negativo chega como surpresa. Aqui a
 * mesma conta vira uma linha que o dashboard e o hub de fluxo mostram sem que
 * ninguém peça.
 *
 * A regra que sustenta o alerta: **sem âncora não há alerta**. Sem saldo
 * conferido a curva parte de ZERO, e qualquer conta a pagar a joga para baixo —
 * toda loja "furaria o caixa amanhã". Alarme que sempre toca é alarme que
 * ninguém escuta; então quando não há âncora este motor se cala e diz por quê.
 */

export type AlertaCaixa = {
  /** Há saldo conferido? Sem ele o resto é null — a curva não tem nível. */
  ancorado: boolean;
  /** Saldo de partida (hoje), em reais. */
  saldoHoje: number | null;
  /** Primeiro dia em que o saldo fica negativo dentro do horizonte; null se nunca. */
  diaNegativo: string | null;
  /** O piso da curva. `dia` null = o piso é o próprio saldo de hoje. */
  menorSaldo: { dia: string | null; valor: number } | null;
  horizonteDias: number;
};

const SEM_ANCORA = (horizonteDias: number): AlertaCaixa => ({
  ancorado: false,
  saldoHoje: null,
  diaNegativo: null,
  menorSaldo: null,
  horizonteDias,
});

/**
 * Compõe o saldo de hoje com a projeção e devolve só o veredito.
 *
 * `parcelas` entra inteira de propósito: as PAGAS alimentam o saldo (pela data
 * do recebimento) e as PREVISTAS alimentam a curva (pelo vencimento) — cada
 * motor aplica o próprio filtro, e passar duas listas separadas só abriria
 * espaço para elas divergirem.
 */
export function alertaDeCaixa(
  saldos: readonly AncoraSaldo[] | undefined,
  parcelas: readonly (ParcelaPaga & ObrigacaoPrevista)[],
  contas: readonly ObrigacaoPrevista[],
  pagamentos: readonly SaidaCaixa[],
  opts: { horizonteDias: Horizonte; hoje?: string },
): AlertaCaixa {
  const hoje = opts.hoje ?? hojeLocal();
  const saldo = saldoDeHoje(saldos, parcelas, pagamentos, hoje);
  if (!saldo) return SEM_ANCORA(opts.horizonteDias);

  const { curva } = projetarCaixa(parcelas, contas, {
    saldoInicial: saldo.valor,
    horizonteDias: opts.horizonteDias,
    hoje,
  });

  return {
    ancorado: true,
    saldoHoje: saldo.valor,
    diaNegativo: curva.diaNegativo,
    menorSaldo: curva.menorSaldo,
    horizonteDias: opts.horizonteDias,
  };
}
