// Avatar de inicial — sem foto de cliente (privacidade/LGPD e nem sempre há foto).
// Círculo com gradiente quente rosé→champagne e iniciais em bordô profundo.
// Presentacional puro; usado na agenda, no rodapé da sidebar e na jornada.

const TAMANHOS = { sm: "h-[34px] w-[34px] text-[12px]", md: "h-9 w-9 text-[12px]" } as const;

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 0 || partes[0] === "") return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}

export function Avatar({
  nome,
  tamanho = "md",
}: {
  nome: string;
  tamanho?: keyof typeof TAMANHOS;
}) {
  return (
    <span
      aria-hidden
      className={[
        "inline-grid shrink-0 place-items-center rounded-full font-medium text-bordo-deep",
        "bg-[linear-gradient(140deg,var(--color-rose-dust),var(--color-champagne))]",
        TAMANHOS[tamanho],
      ].join(" ")}
    >
      {iniciais(nome)}
    </span>
  );
}
