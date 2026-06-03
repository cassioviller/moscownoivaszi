// Tokens visuais e helpers compartilhados pelas telas do Financeiro (receber · pagar ·
// folha). Centraliza foco bordô, min-height de a11y, formatação de dinheiro/data e o
// card de métrica — para que a consistência Concierge viva num lugar só, sem drift.

// — Classes de campo/ação (estados de foco/hover do design) —
export const inputBase =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
export const botaoSuave =
  "inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 " +
  "transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
export const botaoPrincipal =
  "inline-flex min-h-11 w-fit items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel transition-colors duration-150 " +
  "ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

// — Formatação (dinheiro em BRL; data em UTC, na convenção do sistema) —
export const brl = (v: string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

// — Card de métrica do financeiro (resumo de carteira) —
export function Card({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
      <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">{rotulo}</span>
      <span className={`font-display text-[20px] font-light tabular-nums ${destaque ? "text-bordo" : "text-tinta"}`}>{brl(valor)}</span>
    </div>
  );
}
