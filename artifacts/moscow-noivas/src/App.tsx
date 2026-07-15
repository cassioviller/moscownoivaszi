import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";

import { AppLayout } from "@/components/layout/app-layout";
import Login from "@/pages/login";
import SelecionarLoja from "@/pages/selecionar-loja";
import Dashboard from "@/pages/dashboard";

import Leads from "@/pages/leads";
import LeadDetail from "@/pages/leads/[id]";
import Agenda from "@/pages/agenda";
import Vestidos from "@/pages/vestidos";
import VestidoDetail from "@/pages/vestidos/[id]";
import Orcamentos from "@/pages/orcamentos";
import OrcamentoDetail from "@/pages/orcamentos/[id]";
import Contratos from "@/pages/contratos";
import ContratoDetail from "@/pages/contratos/[id]";
import Financeiro from "@/pages/financeiro";
import Comissoes from "@/pages/comissoes";
import Equipe from "@/pages/equipe";
import Configuracoes from "@/pages/configuracoes";

const queryClient = new QueryClient();

function TelaCarregando() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full bg-primary"></div>
      </div>
    </div>
  );
}

/** Guarda de autenticação para rotas fora do escopo /loja/:lojaId. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <TelaCarregando />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Rotas planas antigas (/dashboard, /leads/:id, …) redirecionam para o escopo
 * /loja/:lojaId/… usando a loja ativa da sessão/store. Mantém deep-links e a
 * suíte E2E existentes funcionando durante a unificação.
 */
function LegacyRedirect() {
  const { user, isLoading, activeLojaId } = useAuth();
  const location = useLocation();
  if (isLoading) return <TelaCarregando />;
  if (!user) return <Navigate to="/login" replace />;
  if (!activeLojaId) return <Navigate to="/selecionar-loja" replace />;
  const destino = location.pathname === "/" ? "/dashboard" : location.pathname;
  return <Navigate to={`/loja/${activeLojaId}${destino}${location.search}`} replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/selecionar-loja"
              element={
                <RequireAuth>
                  <SelecionarLoja />
                </RequireAuth>
              }
            />
            <Route path="/loja/:lojaId" element={<AppLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="vestidos" element={<Vestidos />} />
              <Route path="vestidos/:id" element={<VestidoDetail />} />
              <Route path="orcamentos" element={<Orcamentos />} />
              <Route path="orcamentos/:id" element={<OrcamentoDetail />} />
              <Route path="contratos" element={<Contratos />} />
              <Route path="contratos/:id" element={<ContratoDetail />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="comissoes" element={<Comissoes />} />
              <Route path="equipe" element={<Equipe />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="*" element={<LegacyRedirect />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
