/**
 * Quanto tempo um dado buscado continua servindo (D3/E93).
 *
 * O app não tinha NENHUM `staleTime`/`gcTime`/`refetchOnWindowFocus` — o cache
 * era 100% default, o que com o `refetchOnWindowFocus` ligado significa "refaz
 * tudo a cada volta para a aba". Aqui ficam as duas únicas réguas, para que
 * "quanto tempo isto vale" seja uma decisão declarada e não a ausência dela.
 */

/**
 * Piso global, aplicado em `App.tsx` a TODA query. 30 s é a janela em que
 * alternar de aba não é evento de negócio. Não substitui invalidação: o que
 * uma ação muda, ela invalida (ver `lib/financeiro/cache.ts`).
 */
export const PISO_DE_FRESCOR = 30_000;

/**
 * Listas de CONFIGURAÇÃO — cabines, atributos do catálogo, perfis, equipe.
 * Elas não mudam durante o expediente, e quando mudam é por uma ação da
 * própria tela, que invalida a chave na hora. Refazê-las a cada foco de janela
 * era tráfego pelo tráfego.
 */
export const CACHE_ESTAVEL = { staleTime: Number.POSITIVE_INFINITY } as const;
