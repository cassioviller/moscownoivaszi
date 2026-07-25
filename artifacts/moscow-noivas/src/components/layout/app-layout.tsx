import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useParams, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSelecionarLoja, getGetMeQueryKey } from "@workspace/api-client-react";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useStoreStore } from "@/lib/store";
import { decidirLojaDaUrl } from "@/lib/loja-ativa";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { TourAcessoPrimeiraEntrada } from "@/components/tour-acesso";
import { SinoNotificacoes } from "@/components/sino-notificacoes";

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
  const { user, session, isLoading } = useAuth();
  const { activeLojaId, setActiveLojaId } = useStoreStore();
  const [menuAberto, setMenuAberto] = useState(false);
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
