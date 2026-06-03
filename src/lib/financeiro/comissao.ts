// src/lib/financeiro/comissao.ts
// Motor de comissão (S6) — NÚCLEO PURO: aplica faixas sobre o acumulado de vendas.
// Sem banco, sem Prisma — só aritmética em centavos (+ % como número, ex.: 5 = 5%).
// A faixa em que o acumulado FINAL cai manda no mês inteiro (retroativo). As funções
// com banco (regra vigente, acumulado, fechamento) entram nas fatias seguintes e
// delegam a este núcleo.

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
