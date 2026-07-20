import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { deveDeslogar } from "@/lib/auth-erro";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";

import { AppLayout } from "@/components/layout/app-layout";
import Login from "@/pages/login";
import Convite from "@/pages/convite";
import OrcamentoPublico from "@/pages/orcamento-publico";
import LookbookPublico from "@/pages/lookbook-publico";
import SelecionarLoja from "@/pages/selecionar-loja";
import Dashboard from "@/pages/dashboard";

import Leads from "@/pages/leads";
import LeadDetail from "@/pages/leads/[id]";
import Agenda from "@/pages/agenda";
import AgendaSemana from "@/pages/agenda/semana";
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
import UtilizacaoVestidos from "@/pages/vestidos/utilizacao";
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
import Folha from "@/pages/financeiro/folha";
import Auditoria from "@/pages/financeiro/auditoria";
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
import MinhaComissao from "@/pages/minha-comissao";
import Equipe from "@/pages/equipe";
import Configuracoes from "@/pages/configuracoes";

/**
 * Sessão que expira no meio do uso: qualquer query/mutation passa a 401. Em vez
 * de deixar a tela quebrada com dados velhos, zeramos o `getMe` no cache — o
 * `user` vira null e os guards (RequireAuth / o layout da loja) redirecionam
 * para /login pela própria rota, sem reload. Só 401 desloga; 403 é "sem
 * permissão para isto", não "sessão morta". Ver lib/auth-erro.ts.
 */
let queryClient: QueryClient;
// O 401 do PRÓPRIO getMe é a sondagem normal de "não logado" (tela de login,
// bootstrap) e já é tratado pelos guards — mexer no cache dele aqui derruba o
// fluxo pós-login (o guard veria user=null em cache e voltaria para /login).
// Só um 401 de OUTRA query/mutation é sessão que expirou no meio do uso.
const chaveGetMe = JSON.stringify(getGetMeQueryKey());
const derrubarSessao = (error: unknown, chave?: readonly unknown[]) => {
  if (chave && JSON.stringify(chave) === chaveGetMe) return;
  if (deveDeslogar(error)) queryClient.setQueryData(getGetMeQueryKey(), null);
};
queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => derrubarSessao(error, query.queryKey) }),
  mutationCache: new MutationCache({ onError: (error) => derrubarSessao(error) }),
});

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
      {/* attribute="class" liga a paleta .dark do index.css; defaultTheme
          "system" respeita a preferência do SO até o usuário escolher. */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Pública como o login: a convidada ainda não tem sessão. */}
            <Route path="/convite/:token" element={<Convite />} />
            {/* Pública: a noiva abre o orçamento pelo link, sem conta (E13). */}
            <Route path="/orcamento/:token" element={<OrcamentoPublico />} />
            {/* Pública: o lookbook dos vestidos provados, sem conta (E21). */}
            <Route path="/lookbook/:token" element={<LookbookPublico />} />
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
              <Route path="agenda/semana" element={<AgendaSemana />} />
              <Route path="atendimentos" element={<Atendimentos />} />
              <Route path="atendimentos/novo" element={<NovoAtendimento />} />
              <Route path="atendimentos/config" element={<ConfigAtendimentos />} />
              <Route path="ajustes" element={<Ajustes />} />
              <Route path="provas" element={<Provas />} />
              <Route path="reservas" element={<Reservas />} />
              <Route path="reservas/:bloqueioId" element={<ReservaDetalhe />} />
              <Route path="vestidos" element={<Vestidos />} />
              <Route path="vestidos/novo" element={<NovoVestido />} />
              <Route path="vestidos/utilizacao" element={<UtilizacaoVestidos />} />
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
              {/* A folha é um recorte de contas a pagar (as SALARIO de uma
                  competência) + o fechamento com a contabilidade. */}
              <Route path="financeiro/folha" element={<Folha />} />
              <Route path="financeiro/auditoria" element={<Auditoria />} />
              <Route path="comissoes" element={<Comissoes />} />
              <Route path="minha-comissao" element={<MinhaComissao />} />
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
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
