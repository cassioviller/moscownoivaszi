// src/lib/paginacao.ts
// Paginação offset (puro). Página 1-based; valor inválido cai em 1.
export const TAMANHO_PAGINA = 30;

export function paginar(
  paginaRaw: string | number | undefined,
  tamanho: number = TAMANHO_PAGINA,
): { pagina: number; skip: number; take: number } {
  const n = Number(paginaRaw);
  const pagina = Number.isInteger(n) && n >= 1 ? n : 1;
  return { pagina, skip: (pagina - 1) * tamanho, take: tamanho };
}

/** Total de páginas para `total` itens (mínimo 1). */
export function totalPaginas(total: number, tamanho: number = TAMANHO_PAGINA): number {
  return Math.max(1, Math.ceil(total / tamanho));
}
