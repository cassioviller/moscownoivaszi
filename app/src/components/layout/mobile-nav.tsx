"use client";

// Navegação mobile/tablet (<1024px): botão-menu + drawer básico (versão simples,
// conforme trava 6). Fecha no Esc, no clique no overlay e ao navegar. Toque ≥44px.
// Apresentacional: mesmos links da Sidebar, sem autoridade e sem Server Action — o
// logout NÃO vive aqui (fica no Topbar server-side).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navSections, isActive, type NavFlags } from "./nav-items";
import { iconeNav } from "./icones-nav";

export function MobileNav({ lojaId, flags }: { lojaId: string; flags: NavFlags }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sections = navSections(lojaId, flags);

  const drawerRef = useRef<HTMLElement>(null);
  // Quem tinha o foco antes de abrir — p/ devolver ao fechar.
  const gatilhoRef = useRef<HTMLElement | null>(null);

  // Fecha ao trocar de rota.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Gestão de foco do dialog: ao abrir, guarda o gatilho e move o foco p/ dentro;
  // ao fechar (cleanup), devolve o foco a quem o tinha. aria-modal sem isso deixa
  // teclado/leitor de tela presos atrás do overlay.
  useEffect(() => {
    if (!open) return;
    gatilhoRef.current = document.activeElement as HTMLElement | null;
    const node = drawerRef.current;
    const primeiro = node?.querySelector<HTMLElement>("a[href], button:not([disabled])");
    (primeiro ?? node)?.focus();
    return () => gatilhoRef.current?.focus?.();
  }, [open]);

  // Esc fecha; Tab fica preso dentro do drawer (focus trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const node = drawerRef.current;
      if (!node) return;
      const foco = Array.from(
        node.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      ).filter((el) => el.offsetParent !== null);
      if (foco.length === 0) return;
      const primeiro = foco[0];
      const ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--mn-radius-md)] text-grafite transition-colors duration-150 hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
      >
        <span
          aria-hidden
          className="block h-[2px] w-5 bg-current shadow-[0_6px_0_currentColor,0_-6px_0_currentColor]"
        />
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-tinta/20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Navegação"
            className="absolute left-0 top-0 flex h-full w-64 flex-col gap-6 border-r border-champagne bg-papel px-4 py-6 shadow-[var(--mn-shadow-soft)] outline-none"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="inline-flex h-11 w-11 items-center justify-center self-end text-grafite transition-colors duration-150 hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
            >
              ✕
            </button>

            <nav className="flex flex-col gap-5 overflow-y-auto">
              {sections.map((section) => (
                <div key={section.titulo ?? "inicio"} className="flex flex-col gap-0.5">
                  {section.titulo && (
                    <span className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-cinza-fumo">
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
                          "flex min-h-[44px] items-center gap-3 rounded-[var(--mn-radius-md)] px-3 text-[15px] transition-colors duration-150 ease-out",
                          active
                            ? "font-medium text-bordo"
                            : "text-grafite hover:bg-rose-dust/20 hover:text-tinta",
                        ].join(" ")}
                      >
                        {iconeNav(item.icone)}
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
