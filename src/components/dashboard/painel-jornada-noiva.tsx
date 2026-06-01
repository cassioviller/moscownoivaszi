// Jornada vista por UMA noiva — acompanhamento humano, não funil (§10 do DESIGN).
// Mesma espinha champagne do painel agregado, mas aqui cada nó tem estado:
// feito (cumprido), atual (a etapa de agora, em bordô — a "joia", §6) e futuro
// (ainda por vir, suave). Sem números: é o percurso de uma pessoa, não contagem.
import type { PassoJornada } from "@/lib/leads/leads";

export function PainelJornadaNoiva({
  passos,
  encerrada,
}: {
  passos: PassoJornada[];
  encerrada: string | null;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Jornada da noiva</h2>
        {encerrada && (
          <span className="text-[12px] text-cinza-fumo">{encerrada}</span>
        )}
      </div>
      <ol className="flex flex-col">
        {passos.map((p, i) => {
          const ultimo = i === passos.length - 1;
          const atual = p.estado === "atual";
          const feito = p.estado === "feito";
          return (
            <li
              key={p.etapa}
              aria-current={atual ? "step" : undefined}
              className="flex gap-3.5"
            >
              {/* trilho: nó na espinha champagne; o atual vira bordô e ganha presença */}
              <div className="relative flex w-2.5 flex-col items-center pt-[7px]">
                <span
                  aria-hidden
                  className={
                    atual
                      ? "z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-bordo ring-4 ring-papel-elevado"
                      : feito
                        ? "z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-champagne ring-4 ring-papel-elevado"
                        : "z-10 h-2.5 w-2.5 shrink-0 rounded-full border border-borda bg-papel-elevado ring-4 ring-papel-elevado"
                  }
                />
                {!ultimo && <span aria-hidden className="w-px flex-1 bg-champagne/40" />}
              </div>
              {/* rótulo: atual em tinta com peso; futuro suave; feito em grafite */}
              <div className="flex flex-1 items-baseline justify-between gap-4 pb-4">
                <span
                  className={
                    atual
                      ? "text-[14px] text-tinta"
                      : feito
                        ? "text-[14px] text-grafite"
                        : "text-[14px] text-cinza-fumo"
                  }
                >
                  {p.rotulo}
                </span>
                {atual && (
                  <span className="text-[11px] uppercase tracking-[0.15em] text-bordo">Agora</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
