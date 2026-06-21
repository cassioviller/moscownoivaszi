// src/components/Paginacao.tsx
// Rodapé de paginação (Server Component, sem JS de cliente). Some quando cabe numa página.
import Link from "next/link";

export function Paginacao({
  pagina,
  total,
  tamanho,
  href,
}: {
  pagina: number;
  total: number;
  tamanho: number;
  href: (p: number) => string;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  if (total <= tamanho) return null;
  const btn =
    "rounded-md px-2 py-1 text-[13px] text-grafite transition-colors duration-150 hover:bg-papel-suave hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo";
  return (
    <nav className="flex items-center justify-between gap-4 text-[12px] text-cinza-fumo">
      <span>
        Página {pagina} de {paginas} · {total} {total === 1 ? "item" : "itens"}
      </span>
      <span className="flex items-center gap-1">
        {pagina > 1 ? (
          <Link href={href(pagina - 1)} className={btn}>‹ Anterior</Link>
        ) : (
          <span className={`${btn} opacity-40`}>‹ Anterior</span>
        )}
        {pagina < paginas ? (
          <Link href={href(pagina + 1)} className={btn}>Próxima ›</Link>
        ) : (
          <span className={`${btn} opacity-40`}>Próxima ›</span>
        )}
      </span>
    </nav>
  );
}
