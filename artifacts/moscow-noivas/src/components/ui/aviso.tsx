// Aviso do atelier — a confirmação após uma ação, num lugar só (antes vivia em
// financeiro/ui.tsx). Calmo, não banner: hairline + superfície recuada (papel nobre)
// e uma marca discreta. Sucesso veste champagne (luxo silencioso); erro veste bordô
// (atenção, DESIGN §6). role=status p/ leitores de tela. Presentacional e puro — a
// versão que limpa a URL (?ok/?erro) é o AvisoFlash (client) em aviso-flash.tsx.
export function Aviso({
  children,
  tom = "ok",
  className = "",
}: {
  children: React.ReactNode;
  tom?: "ok" | "erro";
  className?: string;
}) {
  const erro = tom === "erro";
  return (
    <p
      role="status"
      className={[
        "flex items-center gap-2.5 rounded-[var(--mn-radius-md)] border px-4 py-3 text-[13px]",
        erro ? "border-bordo/25 bg-bordo/5 text-bordo" : "border-champagne/40 bg-papel-suave text-grafite",
        className,
      ].join(" ")}
    >
      <span aria-hidden className={`text-[12px] ${erro ? "text-bordo" : "text-champagne"}`}>{erro ? "•" : "✓"}</span>
      {children}
    </p>
  );
}
