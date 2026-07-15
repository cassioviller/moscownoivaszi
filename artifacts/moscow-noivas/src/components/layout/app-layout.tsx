import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useStoreStore } from "@/lib/store";

/**
 * Layout das rotas /loja/:lojaId/…: valida a sessão, sincroniza a loja da URL
 * com o store persistido (fonte de verdade das páginas ainda não portadas) e
 * renderiza o chrome (sidebar + área de conteúdo) com um <Outlet/> aninhado.
 */
export function AppLayout() {
  const { lojaId } = useParams();
  const { user, isLoading } = useAuth();
  const { activeLojaId, setActiveLojaId } = useStoreStore();

  useEffect(() => {
    if (lojaId && lojaId !== activeLojaId) {
      setActiveLojaId(lojaId);
    }
  }, [lojaId, activeLojaId, setActiveLojaId]);

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

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-muted/20">
        <div className="container mx-auto p-6 max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
