// src/app/(app)/loja/[lojaId]/calendario/loading.tsx
// Esqueleto sereno enquanto o Calendário carrega — e ao paginar mês/semana. Espelha
// o layout (cabeçalho, abas, grade do Mês) para não haver salto, com um pulsar
// discreto (DESIGN §12: opacity calma, sem brilho nem exagero).
export default function CarregandoCalendario() {
  return (
    <main className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <div className="h-3 w-28 rounded bg-papel-suave" />
        <div className="h-6 w-40 rounded bg-papel-suave" />
        <div className="h-3 w-56 rounded bg-papel-suave" />
      </header>

      {/* abas */}
      <div className="flex gap-6 border-b border-borda-suave pb-3">
        {[64, 96, 104, 120].map((w, i) => (
          <div key={i} className="h-3 rounded bg-papel-suave" style={{ width: w }} />
        ))}
      </div>

      {/* grade do mês (vista padrão) */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 rounded bg-papel-suave" />
          <div className="h-7 w-16 rounded bg-papel-suave" />
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-borda-suave">
          {Array.from({ length: 49 }).map((_, i) => (
            <div key={i} className={`bg-papel-elevado ${i < 7 ? "h-8" : "h-20"}`} />
          ))}
        </div>
      </div>
    </main>
  );
}
