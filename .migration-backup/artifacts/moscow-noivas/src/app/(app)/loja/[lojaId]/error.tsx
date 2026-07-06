"use client";
// Fronteira de erro do atelier (subtree da loja). Antes, qualquer exceção do motor de
// disponibilidade ou do Prisma caía no overlay cru do Next, rompendo a atmosfera. Aqui o
// erro vira uma mensagem calma — dentro do layout (sidebar/topbar permanecem) — com
// "tentar de novo" (reset) e a volta ao início. Tokens Concierge (papel/bordô/serifa).
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ErroLoja({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ lojaId: string }>();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Algo saiu do lugar</h1>
      <p className="max-w-prose text-[14px] text-cinza-fumo">
        Não conseguimos carregar esta parte do atelier agora. Tente de novo em instantes — se persistir,
        atualize a página.
      </p>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center rounded-md bg-bordo px-4 text-[14px] font-medium text-papel transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          Tentar de novo
        </button>
        {params?.lojaId && (
          <Link
            href={`/loja/${params.lojaId}`}
            className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Voltar ao início
          </Link>
        )}
      </div>
    </main>
  );
}
