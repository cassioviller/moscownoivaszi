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
import Atendimentos from "@/pages/atendimentos";
import NovoAtendimento from "@/pages/atendimentos/novo";
import ConfigAtendimentos from "@/pages/atendimentos/config";
import Ajustes from "@/pages/ajustes";
import Provas from "@/pages/provas";
import Reservas from "@/pages/reservas";
import ReservaDetalhe from "@/pages/reservas/[bloqueioId]";
import Vestidos from "@/pages/vestidos";
import VestidoDetail from "@/pages/vestidos/[id]";
import NovoVestido from "@/pages/vestidos/novo";
import EditarVestido from "@/pages/vestidos/[id]/editar";
import Orcamentos from "@/pages/orcamentos";
import OrcamentoDetail from "@/pages/orcamentos/[id]";
import Contratos from "@/pages/contratos";
import ContratoDetail from "@/pages/contratos/[id]";
import FluxoCaixa from "@/pages/financeiro/fluxo";
import DRE from "@/pages/financeiro/dre";
import Projecao from "@/pages/financeiro/projecao";
import Cobranca from "@/pages/financeiro/cobranca";
import Receber from "@/pages/financeiro/receber";
import Pagar from "@/pages/financeiro/pagar";
import Catalogo from "@/pages/catalogo";
import Noivas from "@/pages/noivas";
import NovaNoiva from "@/pages/noivas/nova";
import NoivaDetalhe from "@/pages/noivas/[leadId]";
import EditarNoiva from "@/pages/noivas/[leadId]/editar";
import InteressesNoiva from "@/pages/noivas/[leadId]/interesses";
import NovoAtributo from "@/pages/catalogo/novo";
import EditarAtributo from "@/pages/catalogo/[atributoId]/editar";
import Permissoes from "@/pages/permissoes";
import AdminConsole from "@/pages/admin";
import AdminPerfis from "@/pages/admin/perfis";
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
              <Route path="noivas" element={<Noivas />} />
              <Route path="noivas/nova" element={<NovaNoiva />} />
              <Route path="noivas/:leadId" element={<NoivaDetalhe />} />
              <Route path="noivas/:leadId/editar" element={<EditarNoiva />} />
              <Route path="noivas/:leadId/interesses" element={<InteressesNoiva />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="atendimentos" element={<Atendimentos />} />
              <Route path="atendimentos/novo" element={<NovoAtendimento />} />
              <Route path="atendimentos/config" element={<ConfigAtendimentos />} />
              <Route path="ajustes" element={<Ajustes />} />
              <Route path="provas" element={<Provas />} />
              <Route path="reservas" element={<Reservas />} />
              <Route path="reservas/:bloqueioId" element={<ReservaDetalhe />} />
              <Route path="vestidos" element={<Vestidos />} />
              <Route path="vestidos/novo" element={<NovoVestido />} />
              <Route path="vestidos/:id" element={<VestidoDetail />} />
              <Route path="vestidos/:id/editar" element={<EditarVestido />} />
              <Route path="orcamentos" element={<Orcamentos />} />
              <Route path="orcamentos/:id" element={<OrcamentoDetail />} />
              <Route path="contratos" element={<Contratos />} />
              <Route path="contratos/:id" element={<ContratoDetail />} />
              <Route path="catalogo" element={<Catalogo />} />
              <Route path="catalogo/novo" element={<NovoAtributo />} />
              <Route path="catalogo/:atributoId/editar" element={<EditarAtributo />} />
              {/* O fluxo de caixa É o hub do financeiro: as demais telas são o
                  recorte (dre/projecao) ou a ação (receber/pagar/cobranca). */}
              <Route path="financeiro" element={<FluxoCaixa />} />
              <Route path="financeiro/dre" element={<DRE />} />
              <Route path="financeiro/projecao" element={<Projecao />} />
              <Route path="financeiro/cobranca" element={<Cobranca />} />
              <Route path="financeiro/receber" element={<Receber />} />
              <Route path="financeiro/pagar" element={<Pagar />} />
              <Route path="comissoes" element={<Comissoes />} />
              <Route path="equipe" element={<Equipe />} />
              <Route path="permissoes" element={<Permissoes />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            {/* Console superadmin: fora do AppLayout de loja; traz o próprio shell/gate. */}
            <Route path="/admin" element={<AdminConsole />} />
            <Route path="/admin/perfis" element={<AdminPerfis />} />
            <Route path="*" element={<LegacyRedirect />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
