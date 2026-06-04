// src/app/(app)/loja/[lojaId]/catalogo/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirAcesso } from "@/lib/server/acoes";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { listarAtributosAdmin } from "@/lib/catalogo/catalogo";

export const dynamic = "force-dynamic";

export default async function CatalogoPage({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const sc = await exigirAcesso("config");

  const { lojaId } = await params;
  const { ok } = await searchParams;
  const [atributos, podeCriar, podeEditar] = await Promise.all([
    listarAtributosAdmin(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "config", "criar"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "config", "editar"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href={`/loja/${lojaId}`}
            className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
          >
            ← {sc.loja.nome}
          </Link>
          <h1 className="text-[24px] font-light tracking-tight text-tinta">Catálogo</h1>
          <p className="text-[14px] text-cinza-fumo">
            As características que descrevem vestidos e interesses — e conectam um ao outro.
          </p>
        </div>
        {podeCriar && (
          <Link
            href={`/loja/${lojaId}/catalogo/novo`}
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-bordo px-4 py-2.5
              text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
              hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Novo atributo
          </Link>
        )}
      </header>

      {ok && <p className="text-[13px] text-grafite">Catálogo atualizado.</p>}

      {atributos.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-tinta">Nenhum atributo no catálogo ainda.</p>
          <p className="text-[13px] text-cinza-fumo">
            {podeCriar
              ? "Crie o primeiro — ele passará a aparecer no cadastro de vestidos e de interesses."
              : "Peça à administração para configurar o catálogo."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado">
          {atributos.map((a) => {
            const ativas = a.opcoes.filter((o) => o.ativo);
            const resumo = ativas.map((o) => o.valor).join(" · ") || "sem opções ativas";
            const conteudo = (
              <>
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[14px] text-tinta">{a.nome}</span>
                    <span className="text-[11px] tracking-[0.02em] text-cinza-fumo">
                      {a.tipo === "ESCALA" ? "escala" : "opção única"}
                    </span>
                    {!a.ativo && <span className="text-[11px] text-cinza-fumo">inativo</span>}
                  </span>
                  <span className="text-[12px] text-cinza-fumo">{resumo}</span>
                </span>
                <span className="shrink-0 text-[12px] text-cinza-fumo tabular-nums">
                  {ativas.length} {ativas.length === 1 ? "opção" : "opções"}
                </span>
              </>
            );
            return (
              <li key={a.id}>
                {podeEditar ? (
                  <Link
                    href={`/loja/${lojaId}/catalogo/${a.id}/editar`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-borda-suave"
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
