import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterVestido } from "@/lib/vestidos/vestidos";
import { editarVestidoAction } from "../../actions";
import { VestidoForm } from "../../vestido-form";
import { listarCatalogo } from "@/lib/catalogo/catalogo";

export const dynamic = "force-dynamic";

export default async function EditarVestidoPage({
  params,
}: {
  params: Promise<{ lojaId: string; vestidoId: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"))) redirect(`/loja/${sc.loja.id}/vestidos`);

  const { lojaId, vestidoId } = await params;
  const v = await obterVestido(sc.loja.id, vestidoId);
  if (!v) redirect(`/loja/${lojaId}/vestidos`);
  const catalogo = await listarCatalogo(sc.loja.id);
  const selecoes = Object.fromEntries(v.atributos.map((a) => [a.atributoId, a.opcaoId]));

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/vestidos`} className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit">
          ← Vestidos
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Editar vestido</h1>
      </header>
      <VestidoForm
        action={editarVestidoAction}
        vestidoId={v.id}
        submitLabel="Salvar alterações"
        catalogo={catalogo}
        selecoes={selecoes}
        defaults={{
          codigo: v.codigo,
          nome: v.nome,
          precoBase: v.precoBase.toString(),
          tamanho: v.tamanho ?? undefined,
          cor: v.cor ?? undefined,
          categoria: v.categoria ?? undefined,
          observacoes: v.observacoes ?? undefined,
        }}
      />
    </main>
  );
}
