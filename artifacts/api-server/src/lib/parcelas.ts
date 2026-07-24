/**
 * Rateio do plano de parcelas (gerar-plano), extraído para função pura: é a
 * aritmética que decide quanto cada parcela vale, e centavo aqui é dívida real
 * (C6 mostrou que eles mordem). Tudo em CENTAVOS inteiros — a regra de ouro do
 * repo.
 *
 * Invariantes (provadas por propriedade no lote25):
 * - a soma das parcelas é EXATAMENTE o restante, para qualquer valor/n;
 * - as n−1 primeiras valem floor(restante/n); a última leva a sobra
 *   (restante mod n, sempre < n centavos a mais que as irmãs);
 * - nenhuma parcela é negativa.
 */
export function ratearRestante(restanteCentavos: number, n: number): number[] {
  const base = Math.floor(restanteCentavos / n);
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? restanteCentavos - base * (n - 1) : base,
  );
}
