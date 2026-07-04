// Jornada vista por UMA noiva — acompanhamento humano, não funil (§10 do DESIGN).
// Dois modos, mesmo componente:
//  - vertical (perfil da noiva, coluna estreita): trilho fino, um passo por linha.
//  - horizontal (dashboard, mockup .journey/.track): trilho deitado com resumo
//    (.jsum) derivado só de dado real — sem inventar "responsável".
// O modo é decidido pela presença de `noivaNome`: só o dashboard o informa.
import type { PassoJornada } from "@/lib/leads/jornada";
import { Avatar } from "@/components/ui/avatar";

const FMT_CASAMENTO = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

type Props = {
  passos: PassoJornada[];
  encerrada: string | null;
  // Presentes só quando chamado pelo dashboard (painel.destaqueJornada) — ativam o
  // trilho horizontal. Ausentes → trilho vertical do perfil da noiva (inalterado).
  noivaNome?: string;
  casamentoData?: Date | null;
  diasRestantes?: number | null;
};

export function PainelJornadaNoiva({ passos, encerrada, noivaNome, casamentoData, diasRestantes }: Props) {
  if (noivaNome === undefined) {
    return <JornadaVertical passos={passos} encerrada={encerrada} />;
  }
  return (
    <JornadaHorizontal
      noivaNome={noivaNome}
      passos={passos}
      encerrada={encerrada}
      casamentoData={casamentoData ?? null}
      diasRestantes={diasRestantes ?? null}
    />
  );
}

// ---------- Vertical (perfil da noiva) — trilho original, sem mudanças de visual ----------
function JornadaVertical({ passos, encerrada }: { passos: PassoJornada[]; encerrada: string | null }) {
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
              key={p.chave}
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

// ---------- Horizontal (dashboard) — mockup .journey/.track/.jsum ----------
function JornadaHorizontal({
  noivaNome,
  passos,
  encerrada,
  casamentoData,
  diasRestantes,
}: {
  noivaNome: string;
  passos: PassoJornada[];
  encerrada: string | null;
  casamentoData: Date | null;
  diasRestantes: number | null;
}) {
  const total = passos.length;
  const feitos = passos.filter((p) => p.estado === "feito").length;
  const atualIndex = Math.max(0, passos.findIndex((p) => p.estado === "atual"));
  const proximaEtapa = passos.find((p) => p.estado === "futuro")?.rotulo ?? "—";
  const percentual = total > 0 ? Math.round((feitos / total) * 100) : 0;

  // Linha de base (champagne) some nos centros do primeiro/último nó; a linha
  // bordô avança do início até o centro do nó atual (mesma matemática).
  const leftPad = total > 0 ? (0.5 / total) * 100 : 0;
  const progresso = total > 0 ? ((atualIndex + 0.5) / total) * 100 : 0;

  return (
    <section className="flex flex-col gap-5 overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado px-6 py-6 shadow-[var(--mn-shadow-soft)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 className="shrink-0 font-display text-[16px] font-light text-tinta">Linha do tempo da noiva</h2>
        <div className="flex min-w-0 max-w-full items-center gap-2.5">
          <Avatar nome={noivaNome} tamanho="sm" />
          <span className="min-w-0 truncate text-[13px] font-semibold text-tinta">
            {noivaNome}
            {encerrada && <span className="ml-2 font-normal text-cinza-fumo">{encerrada}</span>}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="relative pt-1 pb-2" style={{ minWidth: `${total * 84}px` }}>
          <div
            aria-hidden
            className="pointer-events-none absolute top-[14px] h-0.5 rounded-full bg-champagne/40"
            style={{ left: `${leftPad}%`, right: `${leftPad}%` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-[14px] h-0.5 rounded-full bg-bordo"
            style={{ left: 0, width: `${progresso}%` }}
          />
          <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0,1fr))` }}>
            {passos.map((p) => {
              const feito = p.estado === "feito";
              const atual = p.estado === "atual";
              return (
                <li key={p.chave} className="flex flex-col items-center gap-2 px-1 text-center">
                  <span
                    aria-hidden
                    className={
                      atual
                        ? "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bordo text-papel-elevado shadow-[0_0_0_4px_rgba(122,24,54,0.12)]"
                        : feito
                          ? "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-champagne text-papel-elevado"
                          : "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-borda bg-papel-elevado"
                    }
                  >
                    {feito && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3">
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                    )}
                  </span>
                  <span
                    className={
                      atual
                        ? "text-[11.5px] font-medium leading-tight text-tinta"
                        : feito
                          ? "text-[11.5px] font-medium leading-tight text-grafite"
                          : "text-[11.5px] font-medium leading-tight text-cinza-fumo"
                    }
                  >
                    {p.rotulo}
                  </span>
                  <span className={atual ? "text-[10px] font-semibold text-bordo" : "text-[10px] text-cinza-fumo"}>
                    {feito ? "Concluído" : atual ? "Agora" : "A seguir"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-borda-suave pt-4">
        <div className="min-w-[130px] flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-cinza-fumo">Próxima etapa</div>
          <div className="mt-1 text-[13.5px] text-tinta">{proximaEtapa}</div>
        </div>
        <div className="min-w-[130px] flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-cinza-fumo">Status geral</div>
          <div className="mt-1 text-[13.5px] tabular-nums text-tinta">{percentual}%</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-papel-suave">
            <div className="h-full rounded-full bg-bordo" style={{ width: `${percentual}%` }} />
          </div>
        </div>
        {casamentoData && (
          <div className="min-w-[130px] flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-cinza-fumo">Casamento</div>
            <div className="mt-1 text-[13.5px] text-tinta">
              {FMT_CASAMENTO.format(casamentoData)}
              {diasRestantes !== null && (
                <span className="text-cinza-fumo"> · faltam {diasRestantes} {diasRestantes === 1 ? "dia" : "dias"}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
