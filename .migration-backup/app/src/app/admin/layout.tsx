import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessao } from "@/lib/auth";
import { logoutAction } from "@/app/(app)/actions";

// Console da plataforma — FORA do gate de loja. Só super-admin entra; não exige lojaAtiva.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  if (!sessao.usuario.isSuperAdmin) redirect("/");

  return (
    <div className="min-h-svh flex flex-col bg-papel">
      <header className="border-b border-borda">
        <div className="mx-auto w-full max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[15px] font-medium tracking-tight text-tinta">
              Moscow Noivas
            </span>
            <span className="text-[12px] text-cinza-fumo">Administração da plataforma</span>
          </div>
          <nav className="flex items-center gap-4 text-[13px]">
            <Link
              href="/"
              className="text-grafite hover:text-tinta transition-colors duration-150"
            >
              Ir para uma loja
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-grafite hover:text-bordo transition-colors duration-150"
              >
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-12">
        {children}
      </main>
    </div>
  );
}
