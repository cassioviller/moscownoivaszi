// src/components/atendimentos/refinar.tsx
// Filtro calmo "Refinar" (Concierge): <details> + <form method="get"> que escreve
// q/vendedora/situacao em searchParams. Sem client JS. Server component.
import Link from "next/link";
import { botaoSuave } from "@/components/ui/acoes";

const campo =
  "rounded-md border border-borda bg-papel-elevado px-3 py-2 text-[14px] text-tinta " +
  "transition-colors duration-150 hover:border-cinza-fumo focus:border-tinta focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
const rotulo = "text-[11px] uppercase tracking-[0.18em] text-cinza-fumo";

export function RefinarAtendimentos({
  action,
  vendedoras,
  situacoes,
  hidden,
  valores,
  temFiltro,
}: {
  action: string;
  vendedoras: { id: string; nome: string }[];
  situacoes: { value: string; rotulo: string }[];
  hidden: { name: string; value: string }[];
  valores: { q?: string; vendedora?: string; situacao?: string };
  temFiltro: boolean;
}) {
  const limparHref =
    action + (hidden.length ? "?" + hidden.map((h) => `${h.name}=${encodeURIComponent(h.value)}`).join("&") : "");
  return (
    <details open={temFiltro} className="rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
        Refinar
        {temFiltro && <span className="inline-block h-1.5 w-1.5 rounded-full bg-bordo" aria-label="filtro ativo" />}
      </summary>
      <form method="get" action={action} className="flex flex-wrap items-end gap-3 border-t border-borda-suave px-4 py-3">
        {hidden.map((h) => (
          <input key={h.name} type="hidden" name={h.name} value={h.value} />
        ))}
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Noiva</span>
          <input type="search" name="q" defaultValue={valores.q ?? ""} placeholder="Buscar noiva" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Vendedora</span>
          <select name="vendedora" defaultValue={valores.vendedora ?? ""} className={campo}>
            <option value="">Todas as vendedoras</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Situação</span>
          <select name="situacao" defaultValue={valores.situacao ?? ""} className={campo}>
            <option value="">Todas</option>
            {situacoes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className={botaoSuave}>
            Refinar
          </button>
          {temFiltro && (
            <Link
              href={limparHref}
              className="text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne"
            >
              Limpar
            </Link>
          )}
        </div>
      </form>
    </details>
  );
}
