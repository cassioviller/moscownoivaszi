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

/**
 * Lê reais como o usuário os escreve — a outra borda, a do teclado.
 *
 * Vazio é `null` (não digitou) e lixo é `NaN` (digitou errado): quem chama
 * precisa distinguir "deixou em branco" de "escreveu bobagem". "1.234,56" e
 * "1234.56" são a mesma quantia; "1.234" são mil duzentos e trinta e quatro,
 * não um e pouco — ponto de milhar é o padrão pt-BR, e ler isso errado por
 * mil vezes é o tipo de engano que só aparece no fechamento.
 */
export function parseValor(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  let normalizado: string;
  if (t.includes(",")) {
    normalizado = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normalizado = t.replace(/\./g, "");
  } else {
    normalizado = t;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : Number.NaN;
}
