"use client";

// Sidebar institucional (desktop ≥1024px). Apresentacional: recebe lojaId + flags
// já resolvidas no servidor e só destaca o item ativo (usePathname). Nenhuma decisão
// de autorização aqui; nenhum Server Action. Fundo marfim, bordô só no item ativo
// (regra da reconciliação: bordô nunca como área grande/fundo). Champagne e rosé só
// como atmosfera (divisória / hover sutil), nunca como estado funcional.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navSections, isActive, type NavFlags } from "./nav-items";
import { iconeNav } from "./icones-nav";
import { Avatar } from "@/components/ui/avatar";

export function Sidebar({
  lojaId,
  flags,
  nome,
  perfil,
}: {
  lojaId: string;
  flags: NavFlags;
  nome: string;
  perfil: string;
}) {
  const pathname = usePathname();
  const sections = navSections(lojaId, flags);

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col gap-6 border-r border-borda-suave bg-papel px-4 py-6">
      <div className="flex items-center gap-2.5 px-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--mn-radius-md)] border-[1.5px] border-bordo font-display text-[17px] text-bordo">
          MN
        </div>
        <div className="font-display text-[15px] leading-tight text-tinta">
          Moscow Noivas
          <span className="mt-[3px] block text-[9px] font-semibold tracking-[0.22em] text-cinza-fumo">
            ATELIER
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <div key={section.titulo ?? "inicio"} className="flex flex-col gap-0.5">
            {section.titulo && (
              <span className="px-3 pb-1.5 pt-3.5 text-[10px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">
                {section.titulo}
              </span>
            )}
            {section.itens.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "relative flex items-center gap-3 rounded-[var(--mn-radius-md)] px-3 py-2 text-[14px] transition-colors duration-150 ease-out",
                    active
                      ? "bg-[rgba(122,24,54,0.06)] font-medium text-bordo"
                      : "text-grafite hover:bg-papel-suave hover:text-tinta",
                  ].join(" ")}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-bordo"
                    />
                  )}
                  {iconeNav(item.icone)}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-borda-suave px-2 pt-4">
        <Avatar nome={nome} tamanho="sm" />
        <div className="min-w-0 text-[12.5px] leading-tight">
          <div className="truncate text-tinta">{nome}</div>
          <div className="text-[11px] text-cinza-fumo">{perfil}</div>
        </div>
      </div>
    </aside>
  );
}
