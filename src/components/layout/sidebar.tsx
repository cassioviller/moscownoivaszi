"use client";

// Sidebar institucional (desktop ≥1024px). Apresentacional: recebe lojaId + flags
// já resolvidas no servidor e só destaca o item ativo (usePathname). Nenhuma decisão
// de autorização aqui; nenhum Server Action. Fundo marfim, bordô só no item ativo
// (regra da reconciliação: bordô nunca como área grande/fundo). Champagne e rosé só
// como atmosfera (divisória / hover sutil), nunca como estado funcional.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navSections, isActive, type NavFlags } from "./nav-items";

export function Sidebar({ lojaId, flags }: { lojaId: string; flags: NavFlags }) {
  const pathname = usePathname();
  const sections = navSections(lojaId, flags);

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col gap-8 border-r border-champagne bg-papel px-4 py-6">
      <div className="px-3">
        <span className="font-display block text-[22px] font-medium leading-none text-tinta">
          Moscow
        </span>
        <span className="mt-1.5 block text-[11px] tracking-[0.24em] uppercase text-cinza-fumo">
          Noivas
        </span>
      </div>

      <nav className="flex flex-col gap-6">
        {sections.map((section) => (
          <div key={section.titulo ?? "inicio"} className="flex flex-col gap-0.5">
            {section.titulo && (
              <span className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">
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
                    "relative rounded-[var(--mn-radius-md)] px-3 py-2 text-[14px] transition-colors duration-150 ease-out",
                    active
                      ? "font-medium text-bordo"
                      : "text-grafite hover:bg-rose-dust/20 hover:text-tinta",
                  ].join(" ")}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-bordo"
                    />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
