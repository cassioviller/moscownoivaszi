import { useEffect, useState } from "react";
import { Navigate, Outlet, useParams, useLocation } from "react-router";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useStoreStore } from "@/lib/store";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { TourAcessoPrimeiraEntrada } from "@/components/tour-acesso";
import { SinoNotificacoes } from "@/components/sino-notificacoes";

/**
 * Layout das rotas /loja/:lojaId/…: valida a sessão, sincroniza a loja da URL
 * com o store persistido (fonte de verdade das páginas ainda não portadas) e
 * renderiza o chrome (sidebar + área de conteúdo) com um <Outlet/> aninhado.
 */
export function AppLayout() {
  const { lojaId } = useParams();
  const { pathname } = useLocation();
  const { user, isLoading } = useAuth();
  const { activeLojaId, setActiveLojaId } = useStoreStore();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    if (lojaId && lojaId !== activeLojaId) {
      setActiveLojaId(lojaId);
    }
  }, [lojaId, activeLojaId, setActiveLojaId]);

  // Fecha o drawer ao trocar de rota (rede de segurança além do onNavigate).
  useEffect(() => setMenuAberto(false), [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full bg-primary"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // E57: o mesmo gate do RequireAuth. O AppLayout é a porta das rotas de loja
  // e não passa por ele — sem isto, /loja/:id/dashboard entraria direto e a
  // troca forçada seria só uma sugestão.
  if (user.precisaTrocarSenha) {
    return <Navigate to="/trocar-senha" replace />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop: barra fixa. Mobile (< md): escondida, vive no drawer abaixo. */}
      <aside className="hidden md:flex md:w-64 shrink-0 border-r">
        <Sidebar />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Cabeçalho só-mobile: hambúrguer que abre a barra como drawer. */}
        <header className="flex items-center gap-3 border-b bg-sidebar px-4 py-3 md:hidden">
          <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir menu"
              onClick={() => setMenuAberto(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              <Sidebar onNavigate={() => setMenuAberto(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-serif text-lg font-medium">Moscow</span>
          {/* E68: no mobile o sino fica no header — o da sidebar vive no drawer. */}
          <span className="ml-auto">
            <SinoNotificacoes />
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/20">
          <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
            <Outlet />
          </div>
        </main>

        {/* Tour do acesso (E24): primeira entrada nesta loja mostra o que o
            perfil libera; depois vive em Configurações → "Seu acesso". */}
        <TourAcessoPrimeiraEntrada />
      </div>
    </div>
  );
}
