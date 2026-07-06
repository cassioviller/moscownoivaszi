// Destaque do atelier (§8.6/§10) — um vestido do acervo com a foto de capa. Peça
// de acervo, não item de estoque: nome editorial, foto de APOIO (modesta, não
// domina a tela — §9). Único lugar do dashboard onde a imagem aparece.
// Mockup .highlight: media 16/10 com a foto (ou silhueta line-art se não houver
// foto real), corpo com modelo/coleção e um CTA bordô — preserva a URL/cache-bust
// e o href já existentes, só troca o traço visual do link discreto p/ botão.
import Link from "next/link";
import type { Destaque } from "@/lib/loja/painel";

export function DestaqueAtelier({ lojaId, destaque }: { lojaId: string; destaque: Destaque }) {
  const temFoto = destaque.versaoFoto > 0;

  return (
    <section className="flex flex-col overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado shadow-[var(--mn-shadow-soft)]">
      <div className="relative flex aspect-[16/10] items-center justify-center border-b border-borda-suave bg-[radial-gradient(120%_90%_at_50%_8%,var(--color-papel-suave),var(--color-papel)_70%)]">
        <span className="absolute left-3 top-3 rounded-full border border-borda-suave bg-papel-elevado px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-cinza-fumo">
          Destaque do acervo
        </span>
        {temFoto ? (
          // foto de capa já otimizada (WebP), servida pelo route escopado
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/loja/${lojaId}/vestidos/${destaque.id}/foto/0?v=${destaque.versaoFoto}`}
            alt={`Capa do vestido ${destaque.nome}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          // Sem foto real: silhueta line-art discreta (nenhum dado inventado).
          <svg
            width="110"
            height="156"
            viewBox="0 0 120 170"
            fill="none"
            stroke="var(--color-champagne)"
            strokeWidth="1.5"
            aria-label={`Silhueta do vestido ${destaque.nome}`}
          >
            <path d="M50 16a10 10 0 0 0 20 0" />
            <path d="M50 16c-6 3-12 6-16 12l14 10-6 8" />
            <path d="M70 16c6 3 12 6 16 12l-14 10 6 8" />
            <path d="M56 46h8" />
            <path d="M54 54c-10 22-20 55-30 96 20 8 60 8 80 0-10-41-20-74-30-96" />
            <path
              d="M42 72c8 6 28 6 36 0M36 104c14 8 34 8 48 0M30 140c18 9 42 9 60 0"
              stroke="var(--color-rose-dust)"
              strokeWidth="1.1"
            />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-1 px-5 py-4">
        <span className="font-display text-[18px] font-light leading-tight tracking-tight text-tinta">
          {destaque.nome}
        </span>
        <span className="text-[12px] tracking-[0.02em] text-cinza-fumo">
          {destaque.codigo}
          {destaque.categoria ? ` · ${destaque.categoria}` : ""}
        </span>
        <Link
          href={`/loja/${lojaId}/vestidos`}
          className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--mn-radius-md)] bg-bordo px-4 text-[13px] font-semibold text-papel-elevado transition-colors duration-150 hover:bg-bordo-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          Ver no acervo
        </Link>
      </div>
    </section>
  );
}
