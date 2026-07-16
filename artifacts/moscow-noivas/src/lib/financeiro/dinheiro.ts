/**
 * Dinheiro no financeiro: a API fala em reais (number), mas toda soma acontece
 * em CENTAVOS INTEIROS. Somar floats em reais acumula erro (0.1 + 0.2 !== 0.3)
 * e um DRE que fecha com um centavo de diferença do fluxo não tem conserto
 * depois — a divergência vira desconfiança no número.
 *
 * Regra: converta na borda (centavos), some inteiro, volte para reais só ao
 * exibir. Mesma convenção do gerar-plano e do rateio de pagamento no backend.
 */

/** Reais → centavos inteiros. */
export function centavos(reais: number): number {
  return Math.round(reais * 100);
}

/** Centavos inteiros → reais. */
export function reais(cents: number): number {
  return cents / 100;
}

/** Soma um campo em reais de uma lista, em centavos inteiros. */
export function somaCentavos<T>(itens: readonly T[], valorDe: (item: T) => number | null | undefined): number {
  return itens.reduce((total, item) => total + centavos(valorDe(item) ?? 0), 0);
}
