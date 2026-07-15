import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

/**
 * Console da plataforma — FORA do escopo /loja/:lojaId (não usa AppLayout nem
 * exige loja ativa). Só superadmin entra; a UI redireciona e o backend revalida
 * o papel em cada endpoint /api/admin/*.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full bg-primary" />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto w-full max-w-4xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-serif text-xl font-bold shadow-sm">
              M
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-lg font-medium">Moscow Noivas</span>
              <span className="text-xs text-muted-foreground">
                Administração da plataforma
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/selecionar-loja">Ir para uma loja</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={logout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-6 py-10 flex flex-col gap-10">
        {children}
      </main>
    </div>
  );
}
