// Destaque do atelier (§8.6/§10) — um vestido do acervo com a foto de capa. Peça
// de acervo, não item de estoque: nome editorial, foto de APOIO (modesta, não
// domina a tela — §9). Único lugar do dashboard onde a imagem aparece.
import type { Destaque } from "@/lib/loja/painel";
import { LinkDiscreto } from "./link-discreto";

export function DestaqueAtelier({ lojaId, destaque }: { lojaId: string; destaque: Destaque }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Destaque do atelier</p>
      <div className="flex items-center gap-5">
        <div className="aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-md border border-borda-suave bg-papel-suave">
          {/* foto de capa já otimizada (WebP), servida pelo route escopado */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/loja/${lojaId}/vestidos/${destaque.id}/foto/0?v=${destaque.versaoFoto}`}
            alt={`Capa do vestido ${destaque.nome}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-[20px] font-light leading-tight tracking-tight text-tinta">
            {destaque.nome}
          </span>
          <span className="text-[12px] tracking-[0.02em] text-cinza-fumo">
            {destaque.codigo}
            {destaque.categoria ? ` · ${destaque.categoria}` : ""}
          </span>
          <div className="mt-1">
            <LinkDiscreto href={`/loja/${lojaId}/vestidos`} label="Ver no acervo" />
          </div>
        </div>
      </div>
    </section>
  );
}
