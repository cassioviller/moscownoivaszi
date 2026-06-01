// Painel "Jornada do atelier" — distribuição das noivas pelas etapas vivas
// (dado real: Lead.etapa). Linha do tempo, não tabela: espinha champagne ligando
// os nós, na ordem do acompanhamento — percurso, não funil (§11 do DESIGN).
// Números em tinta (bordô fica raro, §6).
import type { EtapaJornada } from "@/lib/loja/painel";
import { LinkDiscreto } from "./link-discreto";

export function PainelJornada({ etapas, href }: { etapas: EtapaJornada[]; href: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Jornada do atelier</p>
      <ol className="flex flex-col">
        {etapas.map((e, i) => {
          const ultimo = i === etapas.length - 1;
          return (
            <li key={e.chave} className="flex gap-3.5">
              {/* trilho: nó na espinha champagne (a linha só conecta até o próximo) */}
              <div className="relative flex w-2.5 flex-col items-center pt-[7px]">
                <span
                  aria-hidden
                  className="z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-champagne ring-4 ring-papel-elevado"
                />
                {!ultimo && <span aria-hidden className="w-px flex-1 bg-champagne/40" />}
              </div>
              {/* conteúdo da etapa */}
              <div className="flex flex-1 items-baseline justify-between gap-4 pb-4">
                <span className="text-[14px] text-grafite">{e.rotulo}</span>
                <span className="font-display text-[18px] leading-none text-tinta tabular-nums">
                  {e.total}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <LinkDiscreto href={href} label="Ver todas as noivas" />
    </section>
  );
}
