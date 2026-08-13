import { centavos, reais } from "./dinheiro";

/**
 * **O reajuste da troca de data** — cláusula 17ª, §§ 2º e 3º do instrumento de
 * locação (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > §2º — As trocas de datas para o ano seguinte sofrerão reajuste automático
 * > de **10%** do valor total do contrato.
 * >
 * > §3º — A partir da **segunda troca** haverá reajuste de **20%** e **30% na
 * > terceira**, somando o valor adicional da troca, caso houver.
 *
 * ## A leitura, declarada porque a prosa é ambígua
 *
 * O §3º diz *"a partir da segunda troca"* sem repetir a condição do §2º. Duas
 * leituras cabem:
 *
 * 1. a escada conta **as trocas para o ano seguinte** — a mesma classe do §2º,
 *    que ela está escalando;
 * 2. a escada conta **qualquer troca de data**, e o §2º seria só o caso da
 *    primeira.
 *
 * **Adotamos a (1)**, e por dois motivos. O §3º é parágrafo DO §2º — está sob a
 * mesma cláusula e escala o número dela (10 → 20 → 30). E a leitura (2) cobraria
 * 20% de quem adiantou o casamento em duas semanas dentro do mesmo ano, que
 * nenhuma das duas partes esperaria de um contrato de vestido.
 *
 * **Isto é interpretação, não medição.** Está escrito aqui, no teste e na nota
 * do E211 para que a dona possa corrigir em uma linha se a intenção era outra —
 * e o dia em que corrigir, muda-se `PERCENTUAIS` e o predicado, não a porta.
 *
 * A terceira troca e as seguintes ficam em 30%: o contrato nomeia até a
 * terceira e não diz o que vem depois. Escalar por conta própria seria inventar
 * cláusula; repetir o último degrau é o que o texto sustenta.
 */

/** A escada do §3º: 1ª troca, 2ª, 3ª em diante. */
export const PERCENTUAIS_DA_TROCA_DE_DATA = [10, 20, 30] as const;

/** O percentual desta troca, dado quantas já foram COBRADAS antes dela. */
export function percentualDaTrocaDeData(trocasCobradasAntes: number): number {
  const i = Math.min(Math.max(trocasCobradasAntes, 0), PERCENTUAIS_DA_TROCA_DE_DATA.length - 1);
  return PERCENTUAIS_DA_TROCA_DE_DATA[i]!;
}

/**
 * A troca é "para o ano seguinte"?
 *
 * Compara o ANO CIVIL dos dois dias de negócio (`YYYY-MM-DD`). Mover de
 * dezembro para janeiro seguinte conta — são seis semanas de calendário e um
 * ano a mais de guarda da peça, que é o custo que a cláusula endereça. Mover de
 * janeiro para dezembro do mesmo ano não conta, ainda que sejam onze meses.
 *
 * É o que o texto diz, e a régua tem de ser a do texto: *"trocas de datas para
 * o ANO SEGUINTE"*.
 */
export function trocaParaAnoSeguinte(deDia: string, paraDia: string): boolean {
  return Number(paraDia.slice(0, 4)) > Number(deDia.slice(0, 4));
}

export type ReajusteDaTroca = {
  percentual: number;
  /** Em centavos — a régua da casa para dinheiro que vai ser somado. */
  valorC: number;
  /** Em reais, para a tela e para a coluna. */
  valor: number;
  /** Quantas trocas já tinham sido cobradas antes desta. */
  trocasCobradasAntes: number;
};

/**
 * O reajuste desta troca, ou `null` quando a cláusula não incide.
 *
 * `null` não é erro: é a resposta certa para a troca dentro do mesmo ano, que é
 * a maioria delas. A porta só cobra o que a cláusula manda cobrar.
 */
export function reajusteDaTrocaDeData(params: {
  deDia: string;
  paraDia: string;
  trocasCobradasAntes: number;
  valorTotal: number;
}): ReajusteDaTroca | null {
  if (!trocaParaAnoSeguinte(params.deDia, params.paraDia)) return null;

  const percentual = percentualDaTrocaDeData(params.trocasCobradasAntes);
  // Em CENTAVOS, e arredondando uma vez só: o mesmo cuidado do E25 e do plano
  // de parcelas. `5000.00 * 10 / 100` em ponto flutuante devolve 500.0000001
  // com frequência suficiente para virar centavo perdido na soma do contrato.
  const valorC = Math.round((centavos(params.valorTotal) * percentual) / 100);
  if (valorC <= 0) return null;

  return {
    percentual,
    valorC,
    valor: reais(valorC),
    trocasCobradasAntes: params.trocasCobradasAntes,
  };
}
