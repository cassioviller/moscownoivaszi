import { Link, useLocation, useParams } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Gem,
  Calendar,
  Shirt,
  FileText,
  ScrollText,
  CircleDollarSign,
  Percent,
  Wallet,
  UsersRound,
  Settings,
  LogOut,
  Store,
  BookOpen,
  ShieldCheck,
  CalendarCheck,
  Sparkles,
  Scissors,
  Bookmark,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SinoNotificacoes } from "@/components/sino-notificacoes";
import { moduloLiberado } from "@/lib/permissoes";

type NavItem = { icon: typeof LayoutDashboard; label: string; href: string; modulo?: string };

// Agrupado por contexto: uma lista plana de 17 itens vira uma parede de leitura
// serial. `modulo` espelha o gate de backend; item sem módulo é sempre visível.
const grupos: { titulo?: string; itens: NavItem[] }[] = [
  { itens: [{ icon: LayoutDashboard, label: "Visão Geral", href: "/dashboard" }] },
  {
    titulo: "Relacionamento",
    itens: [
      { icon: Gem, label: "Noivas", href: "/noivas", modulo: "leads" },
      { icon: Calendar, label: "Agenda", href: "/agenda", modulo: "agenda" },
      { icon: CalendarCheck, label: "Atendimentos", href: "/atendimentos", modulo: "agenda" },
      { icon: MessageCircle, label: "Mensagens de hoje", href: "/mensagens", modulo: "agenda" },
    ],
  },
  {
    titulo: "Ateliê",
    itens: [
      { icon: Sparkles, label: "Provas", href: "/provas", modulo: "agenda" },
      { icon: Scissors, label: "Ajustes", href: "/ajustes", modulo: "agenda" },
      // Reservas lê bloqueios de vestido: o backend gateia por vestidos, não agenda.
      { icon: Bookmark, label: "Reservas", href: "/reservas", modulo: "vestidos" },
      { icon: Shirt, label: "Vestidos", href: "/vestidos", modulo: "vestidos" },
      { icon: BookOpen, label: "Catálogo", href: "/catalogo", modulo: "vestidos" },
    ],
  },
  {
    titulo: "Comercial",
    itens: [
      { icon: FileText, label: "Orçamentos", href: "/orcamentos", modulo: "leads" },
      { icon: ScrollText, label: "Contratos", href: "/contratos", modulo: "leads" },
      { icon: CircleDollarSign, label: "Financeiro", href: "/financeiro", modulo: "financeiro" },
      { icon: Percent, label: "Comissões", href: "/comissoes", modulo: "comissao" },
      // Sem `modulo` de propósito: é o extrato da PRÓPRIA pessoa (a rota
      // filtra pela sessão) — a vendedora sem o módulo comissao precisa ver.
      { icon: Wallet, label: "Minha comissão", href: "/minha-comissao" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { icon: UsersRound, label: "Equipe", href: "/equipe", modulo: "admin" },
      { icon: ShieldCheck, label: "Permissões", href: "/permissoes", modulo: "admin" },
      { icon: Settings, label: "Configurações", href: "/configuracoes" },
    ],
  },
];

/**
 * O conteúdo da barra lateral. Renderiza tanto no aside fixo (desktop) quanto
 * dentro do Sheet (mobile) — por isso ocupa `h-full w-full`, sem largura/borda
 * próprias (quem contém decide). `onNavigate` fecha o drawer ao navegar.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { lojaId } = useParams();
  const { logout, user, acessosModulos } = useAuth();
  const base = `/loja/${lojaId}`;

  const podeVer = (item: NavItem) =>
    !item.modulo || !acessosModulos || moduloLiberado(acessosModulos[item.modulo]);

  return (
    <div className="flex h-full w-full flex-col bg-sidebar overflow-y-auto">
      <div className="flex items-center justify-between p-6">
        <Link to={`${base}/dashboard`} onClick={onNavigate} className="flex items-center gap-3 group">
          <div className="h-10 w-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-serif text-xl font-bold shadow-sm group-hover:scale-105 transition-transform">
            M
          </div>
          <span className="font-serif text-xl font-medium text-sidebar-foreground">Moscow</span>
        </Link>
        {/* E68: o sino mora onde toda tela mora. */}
        <SinoNotificacoes />
      </div>

      <div className="px-4 pb-4">
        <Link
          to="/selecionar-loja"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/50 text-sidebar-accent-foreground text-sm font-medium hover:bg-sidebar-accent transition-colors border border-sidebar-border"
        >
          <Store className="h-4 w-4" />
          <span>Trocar de Loja</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-4 pb-4">
        {grupos.map((grupo, i) => {
          const itens = grupo.itens.filter(podeVer);
          if (itens.length === 0) return null;
          return (
            <div key={grupo.titulo ?? i} className="space-y-1">
              {grupo.titulo && (
                <p className="px-3 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {grupo.titulo}
                </p>
              )}
              {itens.map((item) => {
                const isActive = pathname.startsWith(`${base}${item.href}`);
                return (
                  <Link
                    key={item.href}
                    to={`${base}${item.href}`}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-card rounded-md border shadow-sm">
          <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium">
            {user?.nome?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.nome}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="flex-1 justify-start text-muted-foreground hover:text-foreground"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
