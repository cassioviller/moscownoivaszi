import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";
import { navSections, isActive, type NavFlags } from "@/components/layout/nav-items";
import { Link } from "wouter";

interface Props {
  lojaId: string;
  children: ReactNode;
}

export default function LojaLayout({ lojaId, children }: Props) {
  const { usuario, loja, lojaAtivaId, logout } = useAuth();
  const [, navigate] = useLocation();
  const [flags, setFlags] = useState<NavFlags | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pathname] = useLocation();

  useEffect(() => {
    if (!usuario) { navigate("/login"); return; }
    if (!lojaAtivaId) { navigate("/selecionar-loja"); return; }
    if (lojaAtivaId !== lojaId) { navigate(`/loja/${lojaAtivaId}`); return; }
    api.get(`/loja/${lojaId}/flags`).then(setFlags).catch(() => navigate("/selecionar-loja"));
  }, [lojaId, usuario, lojaAtivaId]);

  if (!flags) return (
    <div className="min-h-screen flex items-center justify-center bg-papel">
      <p className="text-grafite text-sm">Carregando…</p>
    </div>
  );

  const sections = navSections(lojaId, flags);

  const NavContent = () => (
    <nav className="flex flex-col gap-6 px-4 py-6">
      {sections.map((section) => (
        <div key={section.titulo ?? "__inicio"} className="flex flex-col gap-1">
          {section.titulo && (
            <span className="px-2 text-[11px] tracking-[0.14em] uppercase text-cinza-fumo font-medium">
              {section.titulo}
            </span>
          )}
          {section.itens.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-md px-2 py-1.5 text-[14px] transition-colors duration-150 ${
                  active
                    ? "bg-champagne/30 text-tinta font-medium"
                    : "text-grafite hover:text-tinta hover:bg-champagne/20"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-papel">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 flex-col border-r border-champagne bg-papel shrink-0">
        <div className="px-5 py-5 border-b border-champagne">
          <span className="text-[13px] font-medium text-tinta">Moscow Noivas</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavContent />
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 w-64 h-full bg-papel border-r border-champagne overflow-y-auto">
            <div className="px-5 py-5 border-b border-champagne flex items-center justify-between">
              <span className="text-[13px] font-medium text-tinta">Moscow Noivas</span>
              <button onClick={() => setMobileOpen(false)} className="text-grafite hover:text-tinta">✕</button>
            </div>
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex items-center gap-3 border-b border-champagne bg-papel px-4 py-3 lg:px-6">
          <button
            className="lg:hidden p-1 text-grafite hover:text-tinta"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            ☰
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[11px] tracking-[0.14em] uppercase text-cinza-fumo">
              {loja?.nome ?? ""}
            </span>
            <span className="truncate text-[14px] text-tinta">Olá, {usuario?.nome?.split(" ")[0]}</span>
          </div>
          <button
            onClick={logout}
            className="ml-auto inline-flex items-center rounded-md border border-borda px-3 py-2 text-[13px] text-grafite transition-colors hover:border-cinza-fumo hover:text-tinta"
          >
            Sair
          </button>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
