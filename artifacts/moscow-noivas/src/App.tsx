import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/selecionar-loja">
        <AppLayout>
          <SelecionarLoja />
        </AppLayout>
      </Route>
      <Route path="/dashboard">
        <AppLayout>
          <Dashboard />
        </AppLayout>
      </Route>
      <Route path="/leads">
        <AppLayout>
          <Leads />
        </AppLayout>
      </Route>
      <Route path="/leads/:id">
        <AppLayout>
          <LeadDetail />
        </AppLayout>
      </Route>
      <Route path="/agenda">
        <AppLayout>
          <Agenda />
        </AppLayout>
      </Route>
      <Route path="/vestidos">
        <AppLayout>
          <Vestidos />
        </AppLayout>
      </Route>
      <Route path="/vestidos/:id">
        <AppLayout>
          <VestidoDetail />
        </AppLayout>
      </Route>
      <Route path="/orcamentos">
        <AppLayout>
          <Orcamentos />
        </AppLayout>
      </Route>
      <Route path="/orcamentos/:id">
        <AppLayout>
          <OrcamentoDetail />
        </AppLayout>
      </Route>
      <Route path="/contratos">
        <AppLayout>
          <Contratos />
        </AppLayout>
      </Route>
      <Route path="/contratos/:id">
        <AppLayout>
          <ContratoDetail />
        </AppLayout>
      </Route>
      <Route path="/financeiro">
        <AppLayout>
          <Financeiro />
        </AppLayout>
      </Route>
      <Route path="/comissoes">
        <AppLayout>
          <Comissoes />
        </AppLayout>
      </Route>
      <Route path="/equipe">
        <AppLayout>
          <Equipe />
        </AppLayout>
      </Route>
      <Route path="/configuracoes">
        <AppLayout>
          <Configuracoes />
        </AppLayout>
      </Route>
      
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
