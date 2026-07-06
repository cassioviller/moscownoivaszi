// Pill de status — warm, nunca verde/amarelo semáforo (DESIGN §5/§Estados).
// ok = confirmado (neutro + check champagne); pendente = aguardando (champagne suave);
// atencao = cuidado (bordô discreto, uso raro).

type Variante = "ok" | "pendente" | "atencao";

const ESTILO: Record<Variante, string> = {
  ok: "bg-papel-suave text-cinza-fumo border border-borda",
  pendente: "bg-[rgba(200,169,118,0.16)] text-[#8a6d3a]",
  atencao: "bg-[rgba(122,24,54,0.08)] text-bordo",
};

export function Selo({ variante, children }: { variante: Variante; children: React.ReactNode }) {
  return (
    <span
      className={[
        "inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium",
        ESTILO[variante],
      ].join(" ")}
    >
      {variante === "ok" && (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" className="h-[11px] w-[11px] stroke-champagne">
          <path d="M4 12l5 5L20 6" />
        </svg>
      )}
      {children}
    </span>
  );
}
