// src/app/(app)/loja/[lojaId]/vestidos/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarVestidos } from "@/lib/vestidos/vestidos";

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
  const [vestidos, podeCriar, podeEditar] = await Promise.all([
    listarVestidos(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href={`/loja/${lojaId}`} className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit">
            ← {sc.loja.nome}
          </Link>
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Vestidos</h1>
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
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhum vestido cadastrado ainda.</p>
          <p className="text-[13px] text-cinza-fumo">
            {podeCriar ? "Cadastre o primeiro vestido do catálogo." : "Peça à administração para cadastrar o catálogo."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
          {vestidos.map((v) => {
            const meta = [v.tamanho, v.cor, v.categoria].filter(Boolean).join(" · ");
            const conteudo = (
              <>
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium tracking-[0.01em] text-grafite tabular-nums">{v.codigo}</span>
                    <span className="text-[14px] text-tinta">{v.nome}</span>
                    {v.status !== "ativo" && <span className="text-[11px] text-cinza-fumo">inativo</span>}
                  </span>
                  {meta && <span className="text-[12px] text-cinza-fumo">{meta}</span>}
                </span>
                <span className="text-[14px] text-tinta tabular-nums">{brl.format(Number(v.precoBase))}</span>
              </>
            );
            return (
              <li key={v.id}>
                {podeEditar ? (
                  <Link
                    href={`/loja/${lojaId}/vestidos/${v.id}/editar`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-borda-suave transition-colors duration-150"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
