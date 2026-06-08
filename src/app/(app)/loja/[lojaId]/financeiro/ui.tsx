// Tokens visuais e helpers compartilhados pelas telas do Financeiro (receber · pagar ·
// folha · comissões · fluxo de caixa). Centraliza foco bordô, min-height de a11y,
// formatação de dinheiro/data, rótulo de competência, título de seção e o card de
// métrica — para que a consistência Concierge viva num lugar só, sem drift.
import { brl } from "@/lib/dinheiro";

export { brl }; // re-export: telas do financeiro importam tudo de "../ui"

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
// Ação que se REPETE por linha de lista (receber/pagar): bordô em contorno, não sólido —
// assim o bordô preenchido continua raro (DESIGN §6, "a cor como joia") e fica reservado
// aos momentos singulares (Lançar, Gerar, Salvar, Confirmar). Mesmo alvo de toque (min-h-11).
export const botaoLinha =
  "inline-flex min-h-11 w-fit items-center rounded-md border border-bordo/40 px-4 text-[13px] font-medium text-bordo " +
  "transition-colors duration-150 ease-out hover:border-bordo hover:bg-bordo/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";

// — Formatação (data em UTC, na convenção do sistema; brl vem de @/lib/dinheiro) —
export const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

// Rótulo de uma competência "YYYY-MM": "março de 2025" (padrão) ou "mar. de 25" (curto).
export function rotuloCompetencia(competencia: string, opts: { curto?: boolean } = {}): string {
  const fmt = opts.curto
    ? { month: "short" as const, year: "2-digit" as const }
    : { month: "long" as const, year: "numeric" as const };
  return new Intl.DateTimeFormat("pt-BR", { ...fmt, timeZone: "UTC" }).format(new Date(`${competencia}-01T00:00:00Z`));
}

// Título de seção do financeiro (caixa-alta espaçado, grafite suave).
export function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">{children}</h2>;
}

// — Filtro de intervalo (lente de visualização: ?ini=&fim=) —
// Form GET com Início/Fim já pré-preenchidos (1º/último dia do mês por padrão).
// `hidden` preserva outros params da URL (status, colaborador…) ao submeter.
export function FiltroIntervalo({
  iniYMD,
  fimYMD,
  hidden,
}: {
  iniYMD: string;
  fimYMD: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      {hidden &&
        Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="flex flex-col gap-1 text-[12px] text-cinza-fumo">
        Início
        <input name="ini" type="date" defaultValue={iniYMD} aria-label="Data inicial" className={`${inputBase} w-40`} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-cinza-fumo">
        Fim
        <input name="fim" type="date" defaultValue={fimYMD} aria-label="Data final" className={`${inputBase} w-40`} />
      </label>
      <button type="submit" className={botaoSuave}>
        Ver
      </button>
    </form>
  );
}

// — Card de métrica do financeiro (resumo de carteira) —
export function Card({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado p-4">
      <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">{rotulo}</span>
      <span className={`font-display text-[20px] font-light tabular-nums ${destaque ? "text-bordo" : "text-tinta"}`}>{brl(valor)}</span>
    </div>
  );
}
