import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Shirt, 
  FileText, 
  ScrollText, 
  CircleDollarSign, 
  Percent, 
  UsersRound, 
  Settings,
  LogOut,
  Store
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { icon: LayoutDashboard, label: "Visão Geral", href: "/dashboard" },
  { icon: Users, label: "Leads", href: "/leads" },
  { icon: Calendar, label: "Agenda", href: "/agenda" },
  { icon: Shirt, label: "Vestidos", href: "/vestidos" },
  { icon: FileText, label: "Orçamentos", href: "/orcamentos" },
  { icon: ScrollText, label: "Contratos", href: "/contratos" },
  { icon: CircleDollarSign, label: "Financeiro", href: "/financeiro" },
  { icon: Percent, label: "Comissões", href: "/comissoes" },
  { icon: UsersRound, label: "Equipe", href: "/equipe" },
  { icon: Settings, label: "Configurações", href: "/configuracoes" },
];

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  return (
    <aside className="w-64 border-r bg-sidebar flex flex-col h-screen overflow-y-auto">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="h-10 w-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-serif text-xl font-bold shadow-sm group-hover:scale-105 transition-transform">
            M
          </div>
          <span className="font-serif text-xl font-medium text-sidebar-foreground">Moscow</span>
        </Link>
      </div>

      <div className="px-4 pb-4">
        <Link href="/selecionar-loja" className="flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/50 text-sidebar-accent-foreground text-sm font-medium hover:bg-sidebar-accent transition-colors border border-sidebar-border">
          <Store className="h-4 w-4" />
          <span>Trocar de Loja</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-card rounded-md border shadow-sm">
          <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-medium">
            {user?.nome?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.nome}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
