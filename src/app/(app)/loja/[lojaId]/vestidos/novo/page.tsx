import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { criarVestidoAction } from "../actions";
import { VestidoForm } from "../vestido-form";

export const dynamic = "force-dynamic";

export default async function NovoVestidoPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "criar"))) redirect(`/loja/${sc.loja.id}/vestidos`);
  const { lojaId } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href={`/loja/${lojaId}/vestidos`} className="text-[13px] text-grafite hover:text-tinta transition-colors duration-150 w-fit">
          ← Vestidos
        </Link>
        <h1 className="text-[24px] font-light tracking-tight text-tinta">Novo vestido</h1>
      </header>
      <VestidoForm action={criarVestidoAction} submitLabel="Cadastrar vestido" />
    </main>
  );
}
