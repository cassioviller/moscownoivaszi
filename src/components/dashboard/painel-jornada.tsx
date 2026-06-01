// Painel "Jornada do atelier" — distribuição das noivas pelas etapas vivas da
// jornada (dado real: Lead.etapa). Não é gráfico: lista calma, etapa + contagem,
// na ordem do acompanhamento. Números em tinta (bordô fica raro, §6 do DESIGN).
import type { EtapaJornada } from "@/lib/loja/painel";
import { LinkDiscreto } from "./link-discreto";

export function PainelJornada({ etapas, href }: { etapas: EtapaJornada[]; href: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Jornada do atelier</p>
      <ul className="flex flex-col divide-y divide-borda-suave">
        {etapas.map((e) => (
          <li key={e.etapa} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="text-[14px] text-grafite">{e.rotulo}</span>
            <span className="font-display text-[18px] leading-none text-tinta tabular-nums">
              {e.total}
            </span>
          </li>
        ))}
      </ul>
      <LinkDiscreto href={href} label="Ver todas as noivas" />
    </section>
  );
}
