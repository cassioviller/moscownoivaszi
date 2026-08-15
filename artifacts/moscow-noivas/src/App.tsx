import {
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  Navigate,
  useLocation,
  useParams,
  useRouteError,
} from "react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { deveDeslogar } from "@/lib/auth-erro";
import { PISO_DE_FRESCOR } from "@/lib/cache";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Erro } from "@/components/estado";
import { useAuth } from "@/hooks/use-auth";

import { AppLayout } from "@/components/layout/app-layout";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";

/**
 * D8/E104 — cada rota é um pedaço, e a recepcionista só baixa o que abre.
 *
 * O app era UM chunk de 1.270 kB (355 kB gzip): quem abria a agenda de manhã
 * baixava a conciliação bancária, o console de superadmin e o gerador de PDF de
 * contrato junto. E o E99 já mediu que a poda dos 24 primitivos NÃO moveu esse
 * número — eles já eram tree-shaken. Só o corte por rota move.
 *
 * Ficam ansiosas quatro: `AppLayout` (é o chrome de toda rota logada), `Login`
 * e `Dashboard` (a primeira e a segunda tela de toda sessão — carregá-las sob
 * demanda trocaria bytes por um piscar no caminho mais percorrido) e
 * `NotFound` (é o fallback; baixá-lo sob demanda é pedir rede para dizer que
 * não achou).
 */
const Convite = lazy(() => import("@/pages/convite"));
const OrcamentoPublico = lazy(() => import("@/pages/orcamento-publico"));
const LookbookPublico = lazy(() => import("@/pages/lookbook-publico"));
const NoivaPortal = lazy(() => import("@/pages/noiva-portal"));
const SelecionarLoja = lazy(() => import("@/pages/selecionar-loja"));
const TrocarSenha = lazy(() => import("@/pages/trocar-senha"));
const Agenda = lazy(() => import("@/pages/agenda"));
const AgendaSemana = lazy(() => import("@/pages/agenda/semana"));
const Atendimentos = lazy(() => import("@/pages/atendimentos"));
const MensagensDoDia = lazy(() => import("@/pages/mensagens"));
const NovoAtendimento = lazy(() => import("@/pages/atendimentos/novo"));
const ConfigAtendimentos = lazy(() => import("@/pages/atendimentos/config"));
const Ajustes = lazy(() => import("@/pages/ajustes"));
const AjusteDetalhe = lazy(() => import("@/pages/ajustes/[ajusteId]"));
const Provas = lazy(() => import("@/pages/provas"));
const Reservas = lazy(() => import("@/pages/reservas"));
const ReservaDetalhe = lazy(() => import("@/pages/reservas/[bloqueioId]"));
const Vestidos = lazy(() => import("@/pages/vestidos"));
const VestidoDetail = lazy(() => import("@/pages/vestidos/[id]"));
const NovoVestido = lazy(() => import("@/pages/vestidos/novo"));
const UtilizacaoVestidos = lazy(() => import("@/pages/vestidos/utilizacao"));
const EstoqueVestidos = lazy(() => import("@/pages/vestidos/estoque"));
const EditarVestido = lazy(() => import("@/pages/vestidos/[id]/editar"));
const Orcamentos = lazy(() => import("@/pages/orcamentos"));
const OrcamentoDetail = lazy(() => import("@/pages/orcamentos/[id]"));
const Contratos = lazy(() => import("@/pages/contratos"));
const ContratoDetail = lazy(() => import("@/pages/contratos/[id]"));
const FluxoCaixa = lazy(() => import("@/pages/financeiro/fluxo"));
const DRE = lazy(() => import("@/pages/financeiro/dre"));
const Projecao = lazy(() => import("@/pages/financeiro/projecao"));
const Cobranca = lazy(() => import("@/pages/financeiro/cobranca"));
const Receber = lazy(() => import("@/pages/financeiro/receber"));
const Pagar = lazy(() => import("@/pages/financeiro/pagar"));
const Folha = lazy(() => import("@/pages/financeiro/folha"));
const Auditoria = lazy(() => import("@/pages/financeiro/auditoria"));
const Conciliacao = lazy(() => import("@/pages/financeiro/conciliacao"));
const Catalogo = lazy(() => import("@/pages/catalogo"));
const Noivas = lazy(() => import("@/pages/noivas"));
const NovaNoiva = lazy(() => import("@/pages/noivas/nova"));
const ConversaoLeads = lazy(() => import("@/pages/noivas/conversao"));
const NoivaDetalhe = lazy(() => import("@/pages/noivas/[leadId]"));
const EditarNoiva = lazy(() => import("@/pages/noivas/[leadId]/editar"));
const InteressesNoiva = lazy(() => import("@/pages/noivas/[leadId]/interesses"));
const NovoAtributo = lazy(() => import("@/pages/catalogo/novo"));
const EditarAtributo = lazy(() => import("@/pages/catalogo/[atributoId]/editar"));
const Permissoes = lazy(() => import("@/pages/permissoes"));
const AdminConsole = lazy(() => import("@/pages/admin"));
const AdminPerfis = lazy(() => import("@/pages/admin/perfis"));
const Comissoes = lazy(() => import("@/pages/comissoes"));
const MinhaComissao = lazy(() => import("@/pages/minha-comissao"));
const Manuais = lazy(() => import("@/pages/manuais"));
const Equipe = lazy(() => import("@/pages/equipe"));
const Configuracoes = lazy(() => import("@/pages/configuracoes"));


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
  // D3 (E93): o cache era 100% default — `staleTime: 0` para tudo. Com o
  // `refetchOnWindowFocus` e o `refetchOnMount` que vêm ligados, isso significa
  // "refaz sempre": cada alt-tab de volta do WhatsApp Web disparava 8 requests
  // no dashboard e 7 em /comissoes, de dados que não mudaram. Um piso de 30 s
  // não é política de frescor — é o reconhecimento de que voltar para a aba não
  // é um evento de negócio. Quem PRECISA de frescor pede explicitamente: o sino
  // tem `refetchInterval: 5min` e todo movimento de caixa invalida o que muda
  // (D9, `lib/financeiro/cache.ts`). A ordem importa: este piso só é seguro
  // porque a invalidação foi consertada ANTES dele — sem ela, ele converteria
  // um incômodo de rede em dado financeiro velho e persistente na tela.
  defaultOptions: { queries: { staleTime: PISO_DE_FRESCOR } },
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
  const location = useLocation();
  if (isLoading) return <TelaCarregando />;
  if (!user) return <Navigate to="/login" replace />;
  // E57: senha escolhida por outra pessoa trava o resto do sistema até ser
  // trocada. A exceção é a própria tela de troca — senão o redirecionamento
  // giraria em círculo.
  if (user.precisaTrocarSenha && location.pathname !== "/trocar-senha") {
    return <Navigate to="/trocar-senha" replace />;
  }
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

/**
 * E31: o módulo `/leads` legado foi absorvido por `/noivas` (que tem busca,
 * paginação, kanban e o motivo de perda). Redireciona lista e detalhe para o
 * módulo vivo, preservando a query e os deep-links/E2E antigos.
 */
function RedirectLeadParaNoiva() {
  const { lojaId, id } = useParams();
  const location = useLocation();
  const destino = id ? `/loja/${lojaId}/noivas/${id}` : `/loja/${lojaId}/noivas`;
  return <Navigate to={`${destino}${location.search}`} replace />;
}

/**
 * A tela de erro do roteador — e ela nasce porque a migração a tornou
 * obrigatória.
 *
 * O `<BrowserRouter>` não capturava erro de render: um `throw` numa tela subia
 * até o topo e a árvore inteira desmontava (tela branca em produção, overlay do
 * Replit em dev). O data router captura, e **traz uma tela padrão própria** —
 * medido montando um elemento que estoura em `createMemoryRouter`:
 *
 *     <h2>Unexpected Application Error!</h2>
 *     <h3>estourei no render</h3>
 *     <pre>Error: estourei no render …a pilha inteira…</pre>
 *
 * Em inglês, com a mensagem do `Error` e a pilha na cara de quem vende. É
 * exatamente a classe que o E92 matou no `mensagemApi` ("HTTP 404 Not Found" no
 * toast do login) e que o `<Erro>` do E99 nasceu consertando — não dá para
 * reintroduzi-la de graça só porque o roteador mudou. O texto do erro vai para
 * o console, que é onde quem dá suporte olha; a tela recebe frase de gente.
 */
function ErroDeRota() {
  const erro = useRouteError();
  console.error("Erro de rota:", erro);
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <Erro titulo="Esta tela quebrou" onTentarNovamente={() => window.location.reload()} />
      </div>
    </div>
  );
}

/**
 * O limite EXTERNO cobre as rotas públicas (portal da noiva, orçamento,
 * lookbook) e o /selecionar-loja, que vivem fora do AppLayout. As rotas logadas
 * suspendem no limite de dentro dele, que é mais próximo e preserva a sidebar.
 *
 * Ele era um `<Suspense>` dentro do `<BrowserRouter>` e agora é uma rota-layout
 * SEM path — a única coisa que a migração da S13 mexeu na árvore. Rota sem path
 * não participa do casamento de URL: as 59 rotas abaixo continuam casando
 * exatamente as mesmas URLs, e o limite continua acima de todas elas.
 */
function LimiteExterno() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="bg-muted h-10 w-48 animate-pulse rounded" aria-busy="true" aria-label="Carregando" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
}

/**
 * S13 — o roteador vira data router para que `useBlocker` exista.
 *
 * A sobra dizia "migrar o roteador toca todas as rotas do app", e por isso o
 * E97 entregou meio conserto: `useConfirmarSaida` cobria fechar/recarregar a
 * aba e deixava passar em silêncio o clique na sidebar com o formulário sujo —
 * em **8 telas**, não nas 3 que o épico contou.
 *
 * O tamanho estava errado por uma ordem de grandeza. `createRoutesFromElements`
 * aceita a árvore JSX como ela está: **nenhum dos 59 `<Route>` mudou**, não há
 * `loader` nem `action` nenhum (a razão pela qual não há nada para migrar), e os
 * três providers já viviam FORA do roteador, que é onde o `RouterProvider` os
 * quer. O que mudou: o import, o `<Suspense>` que virou `LimiteExterno`, e
 * `<BrowserRouter><Routes>` que virou `<RouterProvider>`.
 *
 * Exportado porque é a árvore que o `App.rotas.test.tsx` conta — sem
 * ele, uma rota perdida na migração só apareceria no E2E.
 */
export const rotas = createRoutesFromElements(
  <Route element={<LimiteExterno />} errorElement={<ErroDeRota />}>
    <Route path="/login" element={<Login />} />
    {/* Pública como o login: a convidada ainda não tem sessão. */}
    <Route path="/convite/:token" element={<Convite />} />
    {/* Pública: a noiva abre o orçamento pelo link, sem conta (E13). */}
    <Route path="/orcamento/:token" element={<OrcamentoPublico />} />
    {/* Pública: o lookbook dos vestidos provados, sem conta (E21). */}
    <Route path="/lookbook/:token" element={<LookbookPublico />} />
    {/* Pública: o portal da noiva — um link para tudo dela (E78). */}
    <Route path="/noiva/:token" element={<NoivaPortal />} />
    {/* E57: fora do AppLayout de propósito — quem precisa trocar a
        senha não deve ver a sidebar nem alcançar nenhum módulo. */}
    <Route
      path="/trocar-senha"
      element={
        <RequireAuth>
          <TrocarSenha />
        </RequireAuth>
      }
    />
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
      {/* E31: /leads foi unificado em /noivas — redireciona. */}
      <Route path="leads" element={<RedirectLeadParaNoiva />} />
      <Route path="leads/:id" element={<RedirectLeadParaNoiva />} />
      <Route path="noivas" element={<Noivas />} />
      <Route path="noivas/nova" element={<NovaNoiva />} />
      <Route path="noivas/conversao" element={<ConversaoLeads />} />
      <Route path="noivas/:leadId" element={<NoivaDetalhe />} />
      <Route path="noivas/:leadId/editar" element={<EditarNoiva />} />
      <Route path="noivas/:leadId/interesses" element={<InteressesNoiva />} />
      <Route path="agenda" element={<Agenda />} />
      <Route path="agenda/semana" element={<AgendaSemana />} />
      <Route path="mensagens" element={<MensagensDoDia />} />
      <Route path="atendimentos" element={<Atendimentos />} />
      <Route path="atendimentos/novo" element={<NovoAtendimento />} />
      <Route path="atendimentos/config" element={<ConfigAtendimentos />} />
      <Route path="ajustes" element={<Ajustes />} />
      {/* S-A17: a ficha de UM trabalho — o item do orçamento e a peça do
          acervo apontam para ela, não mais para a fila inteira. */}
      <Route path="ajustes/:ajusteId" element={<AjusteDetalhe />} />
      <Route path="provas" element={<Provas />} />
      <Route path="reservas" element={<Reservas />} />
      <Route path="reservas/:bloqueioId" element={<ReservaDetalhe />} />
      <Route path="vestidos" element={<Vestidos />} />
      <Route path="vestidos/novo" element={<NovoVestido />} />
      <Route path="vestidos/utilizacao" element={<UtilizacaoVestidos />} />
      {/* E154: antes de `vestidos/:id`, senão "estoque" vira um id. */}
      <Route path="vestidos/estoque" element={<EstoqueVestidos />} />
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
      <Route path="financeiro/conciliacao" element={<Conciliacao />} />
      <Route path="comissoes" element={<Comissoes />} />
      <Route path="minha-comissao" element={<MinhaComissao />} />
      {/* E236 — os manuais de uso, para baixar dentro do sistema. */}
      <Route path="manuais" element={<Manuais />} />
      <Route path="equipe" element={<Equipe />} />
      <Route path="permissoes" element={<Permissoes />} />
      <Route path="configuracoes" element={<Configuracoes />} />
      <Route path="*" element={<NotFound />} />
    </Route>
    {/* Console superadmin: fora do AppLayout de loja; traz o próprio shell/gate. */}
    <Route path="/admin" element={<AdminConsole />} />
    <Route path="/admin/perfis" element={<AdminPerfis />} />
    <Route path="*" element={<LegacyRedirect />} />
  </Route>,
);

/**
 * `basename` vazio (BASE_URL = "/") cai no default "/" do próprio roteador — a
 * mesma conta que o `<BrowserRouter>` fazia.
 */
const roteador = createBrowserRouter(rotas, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, ""),
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* attribute="class" liga a paleta .dark do index.css; defaultTheme
          "system" respeita a preferência do SO até o usuário escolher. */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <RouterProvider router={roteador} />
        <Toaster />
      </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
