// src/app/(app)/loja/[lojaId]/layout.tsx
import { redirect } from "next/navigation";
import { getSessaoComLoja, listarLojasDoUsuario } from "@/lib/auth";
import { resolverAcessoLoja, mostrarTrocaLoja } from "@/lib/loja/acesso";
import { ehAdminDaLoja } from "@/lib/admin/usuarios";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

// D8: contagem de tenant nunca cacheada entre requests — render por-request.
export const dynamic = "force-dynamic";

export default async function LojaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lojaId: string }>;
}) {
  const sc = await getSessaoComLoja(); // o gate de (app) já garantiu "ok"
  if (!sc) redirect("/login"); // narrow defensivo

  const { lojaId } = await params;
  const acesso = resolverAcessoLoja(lojaId, sc.loja.id);
  if (!acesso.ok) redirect(acesso.redirectTo);

  // Flags de UX da navegação — resolvidas NO SERVIDOR (autoridade real segue nos
  // gates de cada page/action). Esconder link nunca é a autorização.
  const [podeGerenciarEquipe, podeVerNoivas, podeVerCatalogo, podeVerAjustes, podeVerFinanceiro, lojas] = await Promise.all([
    ehAdminDaLoja(sc.usuario.id, sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "leads", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "config", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "ajustes", "ver"),
    podeNoModulo(sc.usuario.id, sc.loja.id, "financeiro", "ver"),
    listarLojasDoUsuario(sc.usuario.id),
  ]);
  const flags = {
    podeVerNoivas,
    podeVerCatalogo,
    podeVerAjustes,
    podeVerFinanceiro,
    podeGerenciarEquipe,
    isSuperAdmin: sc.usuario.isSuperAdmin,
    mostrarTroca: mostrarTrocaLoja(lojas.length),
  };

  const perfil = sc.usuario.isSuperAdmin
    ? "Super admin"
    : podeGerenciarEquipe
      ? "Administração"
      : "Equipe";

  return (
    <div className="flex min-h-screen">
      <Sidebar lojaId={lojaId} flags={flags} nome={sc.usuario.nome} perfil={perfil} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          lojaId={lojaId}
          nome={sc.usuario.nome}
          lojaNome={sc.loja.nome}
          flags={flags}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
