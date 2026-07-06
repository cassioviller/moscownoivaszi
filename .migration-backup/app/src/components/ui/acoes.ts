// Átomos de ação Concierge — uma fonte só para os dois gestos de interface reusados
// pelas telas: o botão suave (link/ação sublinhada fina, sem fundo, hover champagne,
// foco bordô — DESIGN §6) e o botão principal (bordô, CTA). Antes reimplementados
// inline em 4 telas (financeiro/ui.tsx + reservas, atendimentos, orçamentos), já com
// risco de drift (o relatório apontou min-h-9 vs min-h-11). Ambos são alvo de toque
// ≥44px (min-h-11). O LinkDiscreto do dashboard é deliberadamente outro: link inline
// dentro de card, sem min-height — não é alvo de toque.
export const botaoSuave =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 " +
  "transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

export const botaoPrincipal =
  "inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel transition-colors duration-150 " +
  "ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
