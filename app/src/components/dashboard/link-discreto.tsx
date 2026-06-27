// Link discreto do dashboard — NÃO é CTA: texto sublinhado fino, hover em champagne
// (atmosfera), foco em bordô (DESIGN §6 permite bordô no foco). Sem fundo, sem botão.
import Link from "next/link";

export function LinkDiscreto({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors hover:text-tinta hover:decoration-champagne focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
    >
      {label}
    </Link>
  );
}
