// Esqueleto sereno de tela enquanto o Server Component carrega (e ao paginar/filtrar).
// Espelha a casca comum — cabeçalho + (cards) + lista|grade — para não haver salto, com
// um pulsar discreto (DESIGN §12: opacity calma, sem brilho nem exagero). Antes só o
// Calendário tinha loading; agora as telas force-dynamic de maior latência o reusam.
const LARGURA = { "2xl": "max-w-2xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl" } as const;

export function EsqueletoTela({
  largura = "2xl",
  cards = 0,
  grade,
  linhas = 6,
}: {
  largura?: keyof typeof LARGURA;
  cards?: number; // nº de cards de métrica no topo (0 = nenhum)
  grade?: { classe: string; itens: number; aspecto?: string }; // corpo em grade (acervo/noivas)
  linhas?: number; // nº de linhas quando o corpo é lista
}) {
  return (
    <main className={`mx-auto flex w-full ${LARGURA[largura]} animate-pulse flex-col gap-8 px-6 py-10`}>
      <header className="flex flex-col gap-2">
        <div className="h-3 w-28 rounded bg-papel-suave" />
        <div className="h-6 w-44 rounded bg-papel-suave" />
        <div className="h-3 w-64 rounded bg-papel-suave" />
      </header>

      {cards > 0 && (
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="h-20 flex-1 rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado" />
          ))}
        </div>
      )}

      {grade ? (
        <div className={`grid gap-5 ${grade.classe}`}>
          {Array.from({ length: grade.itens }).map((_, i) => (
            <div key={i} className={`rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado ${grade.aspecto ?? "h-40"}`} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-borda-suave rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-elevado">
          {Array.from({ length: linhas }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="flex flex-col gap-2">
                <div className="h-4 w-40 rounded bg-papel-suave" />
                <div className="h-3 w-56 rounded bg-papel-suave" />
              </div>
              <div className="h-4 w-16 rounded bg-papel-suave" />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
