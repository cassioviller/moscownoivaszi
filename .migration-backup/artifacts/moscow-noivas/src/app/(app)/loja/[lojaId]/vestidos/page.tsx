// src/app/(app)/loja/[lojaId]/vestidos/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarAcervo } from "@/lib/vestidos/vestidos";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function VestidosPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "ver"))) redirect(`/loja/${sc.loja.id}`);

  const { lojaId } = await params;
  const { ok } = await searchParams;
  const [vestidos, podeCriar] = await Promise.all([
    listarAcervo(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "criar"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href={`/loja/${lojaId}`} className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta">
            ← {sc.loja.nome}
          </Link>
          <h1 className="font-display text-[26px] font-light tracking-tight text-tinta">Vestidos</h1>
          <p className="text-[14px] text-cinza-fumo">Cada vestido, uma peça do acervo.</p>
        </div>
        {podeCriar && (
          <Link
            href={`/loja/${lojaId}/vestidos/novo`}
            className="inline-flex items-center justify-center rounded-md bg-bordo px-4 py-2.5
              text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
              hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Novo vestido
          </Link>
        )}
      </header>

      {ok && <p className="text-[13px] text-grafite">Vestido salvo.</p>}

      {vestidos.length === 0 ? (
        <div className="flex flex-col items-center gap-5 rounded-[var(--mn-radius-lg)] border border-borda-suave bg-papel-elevado px-6 py-16 text-center shadow-[var(--mn-shadow-soft)]">
          <p className="font-display text-[22px] font-light tracking-tight text-tinta">O acervo ainda está por compor.</p>
          <p className="max-w-md text-[14px] leading-relaxed text-cinza-fumo">
            {podeCriar
              ? "Cada peça merece ser apresentada. Cadastre o primeiro vestido e comece a montar a coleção do atelier."
              : "Assim que a administração compuser o acervo, cada vestido vai aparecer aqui como peça da coleção."}
          </p>
          {podeCriar && (
            <Link
              href={`/loja/${lojaId}/vestidos/novo`}
              className="inline-flex items-center justify-center rounded-md bg-bordo px-4 py-2.5 text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
            >
              Cadastrar o primeiro vestido
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
          {vestidos.map((v) => (
            <li key={v.id}>
              <Link
                href={`/loja/${lojaId}/vestidos/${v.id}`}
                className="group flex flex-col gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
              >
                <div className="aspect-[3/4] w-full overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-suave">
                  {v.temFoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/loja/${lojaId}/vestidos/${v.id}/foto/0?v=${v.versaoFoto}`}
                      alt={`Capa do vestido ${v.nome}`}
                      loading="lazy"
                      className={`h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02] ${v.status !== "ativo" ? "opacity-60 saturate-50" : ""}`}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="font-display text-[18px] font-light tabular-nums text-cinza-fumo">{v.codigo}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="truncate text-[15px] text-tinta transition-colors duration-150 group-hover:text-bordo">{v.nome}</span>
                  <span className="text-[12px] text-cinza-fumo">
                    {v.codigo}
                    {v.categoria ? ` · ${v.categoria}` : ""}
                    {v.status !== "ativo" ? " · fora do acervo" : ""}
                  </span>
                  <span className="text-[12px] tabular-nums text-grafite">{brl.format(Number(v.precoBase))}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
