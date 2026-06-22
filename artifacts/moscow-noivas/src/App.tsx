import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/contexts/auth";

import LoginPage from "@/pages/LoginPage";
import SelecionarLojaPage from "@/pages/SelecionarLojaPage";
import LojaLayout from "@/pages/loja/LojaLayout";
import DashboardPage from "@/pages/loja/DashboardPage";
import NoivasPage from "@/pages/loja/NoivasPage";
import NoivaPerfilPage from "@/pages/loja/NoivaPerfilPage";
import VestidosPage from "@/pages/loja/VestidosPage";
import ContratosPage from "@/pages/loja/ContratosPage";
import ContratoPage from "@/pages/loja/ContratoPage";
import AtendimentosNovoPage from "@/pages/loja/AtendimentosNovoPage";
import CalendarioPage from "@/pages/loja/CalendarioPage";
import ReservasPage from "@/pages/loja/ReservasPage";
import FinanceiroPage from "@/pages/loja/FinanceiroPage";
import FinanceiroReceberPage from "@/pages/loja/FinanceiroReceberPage";
import FinanceiroPagarPage from "@/pages/loja/FinanceiroPagarPage";
import FinanceiroComissoesPage from "@/pages/loja/FinanceiroComissoesPage";
import PermissoesPage from "@/pages/loja/PermissoesPage";
import EquipePage from "@/pages/EquipePage";
import AdminPage from "@/pages/AdminPage";
import AdminPerfisPage from "@/pages/AdminPerfisPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AuthGate() {
  const { loading, usuario, lojaAtivaId } = useAuth();
  if (loading) return <div className="min-h-svh flex items-center justify-center bg-papel"><span className="text-grafite text-sm">Carregando...</span></div>;
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/selecionar-loja" component={SelecionarLojaPage} />
      <Route path="/loja/:lojaId" nest>
        {(params) => (
          !usuario
            ? <Redirect to="/login" />
            : <LojaLayout lojaId={params.lojaId}>
                <Switch>
                  <Route path="/" component={DashboardPage} />
                  <Route path="/noivas" component={NoivasPage} />
                  <Route path="/noivas/:leadId" component={NoivaPerfilPage} />
                  <Route path="/vestidos" component={VestidosPage} />
                  <Route path="/contratos" component={ContratosPage} />
                  <Route path="/contratos/:contratoId" component={ContratoPage} />
                  <Route path="/atendimentos/novo" component={AtendimentosNovoPage} />
                  <Route path="/calendario" component={CalendarioPage} />
                  <Route path="/reservas" component={ReservasPage} />
                  <Route path="/financeiro" component={FinanceiroPage} />
                  <Route path="/financeiro/receber" component={FinanceiroReceberPage} />
                  <Route path="/financeiro/pagar" component={FinanceiroPagarPage} />
                  <Route path="/financeiro/comissoes" component={FinanceiroComissoesPage} />
                  <Route path="/permissoes" component={PermissoesPage} />
                  <Route component={NotFound} />
                </Switch>
              </LojaLayout>
        )}
      </Route>
      <Route path="/equipe">
        {() => !usuario ? <Redirect to="/login" /> : <EquipePage />}
      </Route>
      <Route path="/admin">
        {() => !usuario ? <Redirect to="/login" /> : <AdminPage />}
      </Route>
      <Route path="/admin/perfis">
        {() => !usuario ? <Redirect to="/login" /> : <AdminPerfisPage />}
      </Route>
      <Route path="/">
        {() => {
          if (!usuario) return <Redirect to="/login" />;
          if (usuario.isSuperAdmin) return <Redirect to="/admin" />;
          if (!lojaAtivaId) return <Redirect to="/selecionar-loja" />;
          return <Redirect to={`/loja/${lojaAtivaId}`} />;
        }}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <AuthGate />
          <Toaster />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
