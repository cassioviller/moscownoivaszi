import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarNoivaAction } from "../actions";
import { NoivaForm } from "../noiva-form";

export const dynamic = "force-dynamic";

export default async function NovaNoivaPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "criar"))) redirect(`/loja/${sc.loja.id}/noivas`);
  const { lojaId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href={`/loja/${lojaId}/noivas`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← Noivas
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Adicionar noiva</h1>
      </header>
      <NoivaForm action={criarNoivaAction} submitLabel="Adicionar noiva" />
    </main>
  );
}
