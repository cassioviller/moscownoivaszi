import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useParams, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSelecionarLoja, getGetMeQueryKey } from "@workspace/api-client-react";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useStoreStore } from "@/lib/store";
import { decidirLojaDaUrl } from "@/lib/loja-ativa";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Search } from "lucide-react";
import { TourAcessoPrimeiraEntrada } from "@/components/tour-acesso";
import { podeNoModulo } from "@/lib/permissoes";

/* E141: o diálogo da busca global é LAZY — app-layout é ansioso (o gotcha do
   replit.md) e o cmdk+dialog só desce no primeiro ⌘K. */
const BuscaGlobalDialog = lazy(() => import("@/components/busca-global"));
import { SinoNotificacoes } from "@/components/sino-notificacoes";
import { BarraAtendimento } from "@/components/barra-atendimento";
import { Carregando } from "@/components/estado";

/**
 * Layout das rotas /loja/:lojaId/…: valida a sessão, faz a loja da URL valer
 * (no store E no servidor) e renderiza o chrome (sidebar + área de conteúdo)
 * com um <Outlet/> aninhado.
 *
 * D1 (E93): este é o ÚNICO lugar do app que escreve `activeLojaId` a partir de
 * uma sincronização — o efeito irmão em `use-auth.tsx` (sessão → store) saiu.
 * A regra de quem ganha mora em `lib/loja-ativa.ts`, pura e testada.
 */
export function AppLayout() {
  const { lojaId } = useParams();
  const { pathname, search } = useLocation();
  const { user, session, isLoading, acessosModulos } = useAuth();
  const { activeLojaId, setActiveLojaId } = useStoreStore();
  const [menuAberto, setMenuAberto] = useState(false);
  // E141/D6: ⌘K/Ctrl+K abre a busca de noivas de qualquer tela logada. O
  // gate espelha o servidor (lib/permissoes); o atalho não dispara com o
  // foco em input/textarea/contenteditable (cuidado b) e o preventDefault
  // ganha do atalho do navegador.
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscaJaAbriu, setBuscaJaAbriu] = useState(false);
  const abrirBusca = () => {
    setBuscaJaAbriu(true);
    setBuscaAberta(true);
  };
  const queryClient = useQueryClient();
  const selecionarLoja = useSelecionarLoja();

  // A loja que esta aba já pediu ao servidor E cuja resposta já chegou. É
  // state, não ref, porque ela MUDA a decisão: enquanto a reivindicação está
  // em voo o valor continua null, e a decisão continua "reivindicar" — senão a
  // tela redirecionaria para a loja da sessão no meio da própria troca.
  const [reivindicada, setReivindicada] = useState<string | null>(null);
  const emVoo = useRef<string | null>(null);

  const decisao = decidirLojaDaUrl({
    urlLojaId: lojaId,
    lojaAtivaId: session?.lojaAtivaId,
    lojas: session?.lojas,
    // Enquanto a troca está EM VOO ela ainda não aconteceu. Sem este `null` a
    // decisão passaria por "já reivindiquei e a sessão está em outra loja" —
    // que é o caso das duas abas — e redirecionaria a aba para a loja antiga
    // no meio da própria troca, para reivindicar de novo do outro lado. O loop
    // deixaria de ser de render e passaria a ser de REDE, que é pior: mais
    // devagar, mais difícil de ver, e escrevendo na sessão a cada volta.
    jaReivindicada: selecionarLoja.isPending ? null : reivindicada,
  });
  const alvo = decisao.tipo === "escolher" ? null : decisao.lojaId;

  // Um efeito, um escritor, e nada que ele escreva reativa outro efeito:
  // `setActiveLojaId` converge na primeira passada (o valor vem da URL, que
  // este efeito não muda) e a reivindicação é travada pela ref `emVoo`.
  const enviarSelecao = selecionarLoja.mutateAsync;
  useEffect(() => {
    if (!alvo) return;
    if (decisao.tipo === "seguir") {
      if (activeLojaId !== alvo) setActiveLojaId(alvo);
      return;
    }
    if (decisao.tipo !== "reivindicar" || emVoo.current === alvo) return;
    emVoo.current = alvo;
    void (async () => {
      try {
        await enviarSelecao({ data: { lojaId: alvo } });
        setActiveLojaId(alvo);
      } catch {
        // A falha não é um beco: a decisão seguinte lê o `lojaAtivaId` que o
        // getMe devolver e manda esta aba para a loja da sessão (ou escolher).
      } finally {
        // A ORDEM importa: relê a sessão ANTES de marcar a reivindicação como
        // concluída. Ao contrário, existe uma janela de um render em que a
        // sessão ainda diz a loja antiga e a marca já diz "reivindiquei" — e a
        // decisão, com razão, lê isso como "outra aba trocou" e redireciona.
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setReivindicada(alvo);
      }
    })();
  }, [decisao.tipo, alvo, activeLojaId, setActiveLojaId, enviarSelecao, queryClient]);

  // Fecha o drawer ao trocar de rota (rede de segurança além do onNavigate).
  useEffect(() => setMenuAberto(false), [pathname]);

  const podeBuscarNoivas = podeNoModulo(acessosModulos, "leads", "ver");
  useEffect(() => {
    if (!podeBuscarNoivas) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      e.preventDefault();
      setBuscaJaAbriu(true);
      setBuscaAberta(true);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [podeBuscarNoivas]);

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

  // Loja da URL que não é da pessoa (ou sessão sem loja): a escolha é dela.
  // Renderizar o conteúdo aqui daria 403 em toda query, sem dizer por quê.
  if (decisao.tipo === "escolher") {
    return <Navigate to="/selecionar-loja" replace />;
  }

  // Outra aba trocou a loja da sessão debaixo desta. Reivindicar de volta
  // seria um pingue-pongue pela rede; esta aba segue a sessão, no MESMO
  // caminho — quem estava em /financeiro/receber continua em receber.
  if (decisao.tipo === "seguir-a-sessao") {
    const resto = pathname.replace(/^\/loja\/[^/]+/, "");
    return <Navigate to={`/loja/${decisao.lojaId}${resto}${search}`} replace />;
  }

  // Reivindicação em voo: o conteúdo ainda não pode montar, porque o servidor
  // responderia 403 a cada query com a loja antiga na sessão.
  if (decisao.tipo === "reivindicar") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full bg-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop: barra fixa. Mobile (< md): escondida, vive no drawer abaixo. */}
      <aside className="hidden md:flex md:w-64 shrink-0 border-r">
        <Sidebar onBuscar={podeBuscarNoivas ? abrirBusca : undefined} />
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
          <span className="ml-auto flex items-center gap-1">
            {podeBuscarNoivas && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Buscar noiva (Ctrl+K)"
                data-testid="abrir-busca-global"
                onClick={abrirBusca}
              >
                <Search className="h-5 w-5" />
              </Button>
            )}
            <SinoNotificacoes />
          </span>
        </header>

        {/* F13/E98 — a barra do atendimento em curso, acima do conteúdo e
            FORA do <main> rolável: ela tem de continuar visível quando a
            vendedora rola uma lista longa de vestidos, que é exatamente a tela
            em que ela está quando esquece o atendimento aberto. Some sozinha
            quando não há nenhum. */}
        <BarraAtendimento />

        {/* E126: `overflow-x-hidden` é o ÚLTIMO passo do épico, depois de as
            fileiras quebrarem — cortar antes esconderia o defeito. Ele mata a
            classe inteira de rolagem lateral SILENCIOSA de página: o que
            estourar daqui em diante fica visível no elemento, não empurrando
            a moldura. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/20">
          <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
            {/* D8/E104 — cuidado (c) do épico: o fallback fica AQUI DENTRO, e
                não em volta do `<AppLayout>`.

                Se envolvesse o layout, trocar de tela faria a sidebar, o header
                e o sino sumirem e voltarem a cada navegação — o chrome piscando
                por causa do conteúdo. Aqui só a área de conteúdo espera, que é
                exatamente o que está sendo baixado. */}
            <Suspense fallback={<Carregando forma="detalhe" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>

        {/* Tour do acesso (E24): primeira entrada nesta loja mostra o que o
            perfil libera; depois vive em Configurações → "Seu acesso". */}
        <TourAcessoPrimeiraEntrada />
      </div>
      {podeBuscarNoivas && buscaJaAbriu && (
        <Suspense fallback={null}>
          <BuscaGlobalDialog aberto={buscaAberta} onFechar={() => setBuscaAberta(false)} />
        </Suspense>
      )}
    </div>
  );
}
