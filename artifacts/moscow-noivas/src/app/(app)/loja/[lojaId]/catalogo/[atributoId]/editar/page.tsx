import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterAtributo } from "@/lib/catalogo/catalogo";
import { editarAtributoAction } from "../../actions";
import { AtributoForm } from "../../atributo-form";

export const dynamic = "force-dynamic";

export default async function EditarAtributoPage({
  params,
}: {
  params: Promise<{ lojaId: string; atributoId: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "config", "editar"))) redirect(`/loja/${sc.loja.id}/catalogo`);

  const { lojaId, atributoId } = await params;
  const atributo = await obterAtributo(sc.loja.id, atributoId);
  if (!atributo) redirect(`/loja/${lojaId}/catalogo`);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}/catalogo`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← Catálogo
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Editar atributo</h1>
      </header>
      <AtributoForm action={editarAtributoAction} submitLabel="Salvar alterações" atributo={atributo} />
    </main>
  );
}
