import { redirect } from "next/navigation";
import {
  getSessao,
  getSessaoComLoja,
  listarLojasDoUsuario,
  definirLojaAtiva,
} from "@/lib/auth";
import { logoutAction } from "@/app/(app)/actions";
import { SelecaoForm } from "./selecao-form";

export default async function SelecionarLojaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");

  // Já tem loja ativa VÁLIDA (existe + ativa)? Não mostra o seletor.
  // Usar getSessaoComLoja (não o campo cru) evita loop quando a loja foi desativada.
  const comLoja = await getSessaoComLoja();
  if (comLoja) redirect("/");

  const lojas = await listarLojasDoUsuario(sessao.usuario.id);

  // 1 loja: auto-select server-side, sem render visível.
  if (lojas.length === 1) {
    await definirLojaAtiva(sessao.sessao.id, lojas[0].id, sessao.usuario.id);
    redirect("/");
  }

  // 0 lojas: estado vazio + logout (sem loop).
  if (lojas.length === 0) {
    return (
      <main className="min-h-svh flex items-center justify-center bg-papel px-6 py-12 sm:py-24">
        <div className="w-full max-w-[360px] flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-[24px] sm:text-[28px] font-light tracking-tight leading-[1.15] text-tinta">
              Sem acesso a lojas
            </h1>
            <p className="text-[14px] leading-relaxed text-grafite">
              Sua conta não tem acesso a nenhuma loja. Procure o administrador.
            </p>
          </header>
          <form action={logoutAction}>
            <button
              type="submit"
              className="
                inline-flex items-center justify-center
                rounded-md border border-borda bg-papel-elevado px-4 py-2.5
                text-[14px] font-medium tracking-[0.01em] text-tinta
                transition-colors duration-150 ease-out
                hover:border-cinza-fumo
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
              "
            >
              Sair
            </button>
          </form>
        </div>
      </main>
    );
  }

  // >1 loja: o usuário escolhe.
  const { erro } = await searchParams;
  return (
    <main className="min-h-svh flex items-center justify-center bg-papel px-6 py-12 sm:py-24">
      <div className="w-full max-w-[360px] flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-[24px] sm:text-[28px] font-light tracking-tight leading-[1.15] text-tinta">
            Escolha a loja
          </h1>
          <p className="text-[14px] leading-relaxed text-grafite">
            Você tem acesso a mais de uma loja. Selecione com qual quer trabalhar.
          </p>
        </header>
        <SelecaoForm
          lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
          erro={erro === "acesso"}
        />
      </div>
    </main>
  );
}
