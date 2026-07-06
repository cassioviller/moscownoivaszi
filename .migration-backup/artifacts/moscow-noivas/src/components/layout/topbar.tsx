// Topo operacional. SERVER COMPONENT de propósito (trava 3): mantém o
// <form action={logoutAction}> exatamente no padrão já usado no dashboard, sem
// passar Server Action para nenhum componente client. Renderiza o MobileNav
// (client, só hamburger+drawer) à esquerda. Saudação humana + loja ativa + usuário.

import { logoutAction } from "@/app/(app)/actions";
import { MobileNav } from "./mobile-nav";
import type { NavFlags } from "./nav-items";

export function Topbar({
  lojaId,
  nome,
  lojaNome,
  flags,
}: {
  lojaId: string;
  nome: string;
  lojaNome: string;
  flags: NavFlags;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-champagne bg-papel px-4 py-3 lg:px-6">
      <MobileNav lojaId={lojaId} flags={flags} />

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] tracking-[0.14em] uppercase text-cinza-fumo">
          {lojaNome}
        </span>
        <span className="truncate text-[14px] text-tinta">Olá, {nome}</span>
      </div>

      <form action={logoutAction} className="ml-auto">
        <button
          type="submit"
          className="inline-flex items-center rounded-[var(--mn-radius-md)] border border-borda px-3 py-2 text-[13px] text-grafite transition-colors duration-150 ease-out hover:border-cinza-fumo hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          Sair
        </button>
      </form>
    </header>
  );
}
