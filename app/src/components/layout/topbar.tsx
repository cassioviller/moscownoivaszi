// Topo operacional. SERVER COMPONENT de propósito (trava 3): mantém o
// <form action={logoutAction}> exatamente no padrão já usado no dashboard, sem
// passar Server Action para nenhum componente client. Renderiza o MobileNav
// (client, só hamburger+drawer) à esquerda. Saudação editorial + busca (visual,
// sem lógica ainda) + loja ativa + notificações + logout.

import { logoutAction } from "@/app/(app)/actions";
import { MobileNav } from "./mobile-nav";
import type { NavFlags } from "./nav-items";

export function Topbar({
  lojaId,
  nome,
  lojaNome,
  flags,
  notificacoes,
}: {
  lojaId: string;
  nome: string;
  lojaNome: string;
  flags: NavFlags;
  // Contagem de notificações não lidas. Nenhum chamador passa isso ainda —
  // o badge (`.bell-badge`) só aparece quando houver contagem > 0. Prop
  // deixada pronta para quando o recurso de notificações existir.
  notificacoes?: number;
}) {
  // Saudação humana calculada no fuso do salão — única fonte de recepção
  // (o antigo SaudacaoDia no corpo da página foi removido na Task 13).
  const agora = new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(agora);
  const hora = Number(fmt({ hour: "numeric", hour12: false }));
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dataPorExtenso = fmt({ weekday: "long", day: "numeric", month: "long" });
  const dataCapitalizada = dataPorExtenso.charAt(0).toUpperCase() + dataPorExtenso.slice(1);
  const primeiroNome = nome.split(" ")[0];

  const mostrarBadge = Boolean(notificacoes && notificacoes > 0);

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-borda-suave bg-papel/85 px-4 py-3 backdrop-blur-sm lg:px-6">
      <MobileNav lojaId={lojaId} flags={flags} />

      <div className="flex min-w-0 flex-col">
        <span className="truncate font-display text-[20px] leading-[1.1] text-tinta">
          {saudacao}, {primeiroNome}
        </span>
        <span className="truncate text-[12px] text-cinza-fumo">
          {dataCapitalizada} — aqui, cada detalhe importa.
        </span>
      </div>

      <label className="ml-2 hidden max-w-[420px] flex-1 items-center gap-2 rounded-[var(--mn-radius-md)] border border-borda bg-papel px-3 py-2 text-cinza-fumo transition-colors duration-150 ease-out hover:border-rose-dust focus-within:border-bordo md:flex">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.7}
          className="h-4 w-4 flex-none stroke-current"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.2-3.2" />
        </svg>
        <input
          type="text"
          placeholder="Buscar noivas, atendimentos, vestidos…"
          aria-label="Buscar"
          className="w-full min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-cinza-fumo"
        />
        <span
          aria-hidden
          className="flex-none rounded-md border border-borda px-1.5 py-0.5 text-[10px] text-cinza-fumo"
        >
          ⌘K
        </span>
      </label>

      <div className="ml-auto flex flex-none items-center gap-2">
        <button
          type="button"
          className="hidden items-center gap-2 rounded-[var(--mn-radius-md)] border border-borda bg-papel px-3 py-2 text-[12.5px] text-grafite transition-colors duration-150 ease-out hover:border-rose-dust hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo sm:inline-flex"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.7}
            className="h-[15px] w-[15px] flex-none stroke-current"
          >
            <path d="M3 6h18M6 12h12M10 18h4" />
          </svg>
          <span className="max-w-[16ch] truncate">{lojaNome}</span>
        </button>

        <button
          type="button"
          aria-label="Notificações"
          className="relative inline-flex h-10 w-10 flex-none items-center justify-center rounded-[var(--mn-radius-md)] border border-borda bg-papel text-grafite transition-colors duration-150 ease-out hover:border-rose-dust hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.7}
            className="h-[18px] w-[18px] stroke-current"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {mostrarBadge && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-bordo px-1 text-[10px] font-bold text-papel">
              {notificacoes}
            </span>
          )}
        </button>

        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex items-center rounded-[var(--mn-radius-md)] border border-borda px-3 py-2 text-[13px] text-grafite transition-colors duration-150 ease-out hover:border-cinza-fumo hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
