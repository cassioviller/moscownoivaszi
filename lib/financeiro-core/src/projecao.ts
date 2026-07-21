import { centavos, reais } from "./dinheiro";
import { addDias, diaDeNegocio, hojeLocal } from "./datas";
import { estaAberta, saldoAberto, type ObrigacaoPrevista } from "./caixa";

/**
 * Projeção de caixa: parte de um saldo e aplica os eventos previstos dia a dia,
 * devolvendo a curva, o menor saldo e o primeiro dia negativo — a pergunta real
 * é "o dinheiro acaba antes de entrar?".
 *
 * Vencidos em aberto NÃO entram na curva: já deviam ter acontecido e entrariam
 * na data errada, empurrando a curva para cima com dinheiro que não veio. Vão
 * para `emAtraso`, à parte.
 */

export type EventoDia = { dia: string; entradasC: number; saidasC: number };
export type LinhaCurva = { dia: string; entradas: number; saidas: number; saldoApos: number };
export type Curva = {
  linhas: LinhaCurva[];
  /** `dia` null = o piso é o próprio saldo de partida (nada o derruba). */
  menorSaldo: { dia: string | null; valor: number };
  /** Primeiro dia em que o saldo fica negativo; null se nunca. */
  diaNegativo: string | null;
};

/** Aplica os eventos sobre o saldo de partida, em centavos. */
export function montarCurva(saldoInicialC: number, eventos: readonly EventoDia[]): Curva {
  const porDia = new Map<string, { entradasC: number; saidasC: number }>();
  for (const e of eventos) {
    const d = porDia.get(e.dia);
    if (d) {
      d.entradasC += e.entradasC;
      d.saidasC += e.saidasC;
    } else {
      porDia.set(e.dia, { entradasC: e.entradasC, saidasC: e.saidasC });
    }
  }
  const ordenados = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let saldoC = saldoInicialC;
  let menorC = saldoInicialC;
  let menorDia: string | null = null;
  let diaNegativo: string | null = null;

  const linhas: LinhaCurva[] = ordenados.map(([dia, e]) => {
    saldoC += e.entradasC - e.saidasC;
    if (saldoC < menorC) {
      menorC = saldoC;
      menorDia = dia;
    }
    if (diaNegativo === null && saldoC < 0) diaNegativo = dia;
    return { dia, entradas: reais(e.entradasC), saidas: reais(e.saidasC), saldoApos: reais(saldoC) };
  });

  return { linhas, menorSaldo: { dia: menorDia, valor: reais(menorC) }, diaNegativo };
}

export const HORIZONTES = [30, 60, 90] as const;
export type Horizonte = (typeof HORIZONTES)[number];

/** Normaliza o horizonte vindo da URL para 30/60/90 (default 90). */
export function normalizarHorizonte(raw: string | number | null | undefined): Horizonte {
  const n = Number(raw);
  return (HORIZONTES as readonly number[]).includes(n) ? (n as Horizonte) : 90;
}

export type Projecao = {
  curva: Curva;
  emAtraso: { aReceber: number; aPagar: number };
  horizonteDias: Horizonte;
};

/**
 * Monta a projeção a partir do previsto em aberto. `saldoInicial` é o ponto de
 * partida (a âncora de saldo); sem âncora, passe 0 — a curva ainda mostra a
 * FORMA do mês, só não o nível.
 */
export function projetarCaixa(
  parcelas: readonly ObrigacaoPrevista[],
  contas: readonly ObrigacaoPrevista[],
  opts: { saldoInicial: number; horizonteDias: Horizonte; hoje?: string },
): Projecao {
  const hoje = opts.hoje ?? hojeLocal();
  const limite = addDias(hoje, opts.horizonteDias); // hoje+H, inclusivo

  const eventos: EventoDia[] = [];
  let atrasoReceberC = 0;
  let atrasoPagarC = 0;

  // O SALDO, não o previsto (E49): metade já recebida não pode ser projetada
  // como se ainda fosse entrar — a curva nasceria acima do caixa real.
  for (const p of parcelas) {
    if (!estaAberta(p)) continue;
    const dia = diaDeNegocio(p.vencimento);
    if (dia < hoje) atrasoReceberC += centavos(saldoAberto(p));
    else if (dia <= limite) eventos.push({ dia, entradasC: centavos(saldoAberto(p)), saidasC: 0 });
  }
  for (const c of contas) {
    if (!estaAberta(c)) continue;
    const dia = diaDeNegocio(c.vencimento);
    if (dia < hoje) atrasoPagarC += centavos(saldoAberto(c));
    else if (dia <= limite) eventos.push({ dia, entradasC: 0, saidasC: centavos(saldoAberto(c)) });
  }

  return {
    curva: montarCurva(centavos(opts.saldoInicial), eventos),
    emAtraso: { aReceber: reais(atrasoReceberC), aPagar: reais(atrasoPagarC) },
    horizonteDias: opts.horizonteDias,
  };
}
