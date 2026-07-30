import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetLeadsParados,
  getGetLeadsParadosQueryKey,
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useGetMinhaComissao,
  getGetMinhaComissaoQueryKey,
  useListParcelas,
  getListParcelasQueryKey,
  useListOrcamentos,
  getListOrcamentosQueryKey,
  useUpdateAtendimento,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router";
import {
  Calendar,
  Users,
  FileText,
  CheckCircle2,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  PhoneCall,
  MessageCircle,
} from "lucide-react";
import { diaMesAno, etapaLabel, instanteHora } from "@/lib/formatos";
import { brl } from "@/lib/formatos";
import { AlertaCaixa } from "@/components/alerta-caixa";
import { Erro } from "@/components/estado";
import { podeNoModulo } from "@/lib/permissoes";
import { mensagemApi } from "@/lib/erro-api";

import { competenciaAtual, hojeLocal, addDias, inicioDoDia } from "@/lib/financeiro/datas";
import { agingDeParcelas } from "@/lib/financeiro/cobranca";
import {
  aContatarNaJanela,
  orcamentosVencendoNaJanela,
  resumoDaFila,
} from "@/lib/mensagens-do-dia";

/**
 * E66 — "meu dia", não "números da loja".
 *
 * O painel mostrava 4 contadores iguais para todo mundo. Agora cada persona
 * abre no que decide o dia dela: a dona vê o dinheiro (a receber/pagar e o
 * alerta de caixa), a vendedora vê a própria comissão e as noivas esfriando,
 * a recepcionista vê a agenda de hoje. Nenhuma régua nova — só os motores que
 * já existiam (dashboard, funil-core, minha-comissão), compostos por perfil.
 */
export default function Dashboard() {
  const { activeLojaId, acessosModulos, user } = useAuth();

  const veLeads = podeNoModulo(acessosModulos, "leads", "ver");
  const veAgenda = podeNoModulo(acessosModulos, "agenda", "ver");
  const veFinanceiro = podeNoModulo(acessosModulos, "financeiro", "ver");

  /**
   * E121/C3 — a query inteira, não só `data`: falhou o GET do painel, os 4
   * contadores e os 2 cards de dinheiro viravam medição ("Noivas ativas 0",
   * "A receber R$ 0,00") — a dona lia o zero de falha com os mesmos pixels do
   * zero de verdade e ligava para a vendedora achando que o mês parou.
   */
  const painelQuery = useGetDashboard(activeLojaId!, {
    query: {
      queryKey: getGetDashboardQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    }
  });
  const { data: dashboard, isLoading } = painelQuery;

  // E79: a régua do funil roda no banco — o painel pede só as contagens e as
  // 10 piores, não a lista completa de leads.
  const paradosQuery = useGetLeadsParados(activeLojaId!, {
    query: { queryKey: getGetLeadsParadosQueryKey(activeLojaId!), enabled: !!activeLojaId && veLeads },
  });
  /**
   * A agenda das próximas 48h — UMA consulta que serve "Hoje na loja" e a
   * contagem da fila do F7.
   *
   * O painel pedia a janela de HOJE (E83) e o F7 precisa das 48h. Duas consultas
   * seria o caminho óbvio e errado: a de 48h **contém** a de hoje, e o corte por
   * hora já roda no cliente. Então a janela abriu e a outra saiu — o cartão novo
   * não custa request nenhum de agenda, e a chave passou a ser a MESMA de
   * `/mensagens`, que o react-query deduplica ao navegar para lá.
   *
   * De quebra o recorte de hoje ficou mais correto, não menos: com a janela de
   * um dia só, um navegador em fuso adiantado podia perder o fim do dia da loja.
   */
  const janela48h = { de: hojeLocal(), ate: addDias(hojeLocal(), 2) };
  const atendimentosQuery = useListAtendimentos(activeLojaId!, janela48h, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, janela48h),
      enabled: !!activeLojaId && veAgenda,
    },
  });

  /**
   * F7 — a fila de mensagens contada com a MESMA régua e as MESMAS chaves de
   * query que `/mensagens` usa (`lib/mensagens-do-dia`).
   *
   * A alternativa era contar sobre o que o painel já tinha em mãos — a agenda de
   * hoje — e o número sairia menor que o da fila, que olha 48h. Um painel que
   * promete três mensagens e entrega cinco é pior que um painel calado.
   *
   * Cada bloco é gateado pelo próprio módulo: quem só tem agenda não paga as
   * consultas de dinheiro, e conta só o que pode ver.
   */
  const paramsAbertas = { status: "abertas" as const };
  const parcelasAbertas = useListParcelas(activeLojaId!, paramsAbertas, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!, paramsAbertas),
      enabled: !!activeLojaId && veFinanceiro,
    },
  });
  const paramsEnviados = { status: "ENVIADO" as const };
  const orcamentosEnviados = useListOrcamentos(activeLojaId!, paramsEnviados, {
    query: {
      queryKey: getListOrcamentosQueryKey(activeLojaId!, paramsEnviados),
      enabled: !!activeLojaId && veLeads,
    },
  });

  const filaDeMensagens = useMemo(() => {
    const agora = Date.now();
    const aContatar = aContatarNaJanela(atendimentosQuery.data ?? [], agora).length;
    const emAtraso = agingDeParcelas(parcelasAbertas.data ?? []).noivas.length;
    const vencendo = orcamentosVencendoNaJanela(orcamentosEnviados.data ?? [], agora).length;
    return resumoDaFila(aContatar + emAtraso + vencendo);
  }, [atendimentosQuery.data, parcelasAbertas.data, orcamentosEnviados.data]);

  // "Minha comissão" mora fora do gate de módulo (E11); quem não tem escada
  // vigente volta temRegra=false e o cartão simplesmente não aparece.
  const competencia = competenciaAtual();
  const minhaComissao = useGetMinhaComissao(activeLojaId!, { competencia }, {
    query: {
      queryKey: getGetMinhaComissaoQueryKey(activeLojaId!, { competencia }),
      enabled: !!activeLojaId,
      retry: false,
    },
  });

  /**
   * F10 — "Iniciar" no lugar onde a recepcionista já está.
   *
   * O gesto existia só na fila de `/atendimentos`. É o mesmo PATCH e o mesmo
   * gate; o que NÃO veio junto foi a régua de concluir (o desfecho `RESERVOU`
   * que oferece abrir o orçamento), porque ela é sobre o fim do atendimento e
   * copiá-la para cá seria duas cópias de uma decisão de produto.
   */
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const podeEditarAgenda = podeNoModulo(acessosModulos, "agenda", "editar");
  const iniciarAtendimento = useUpdateAtendimento();
  const iniciar = async (atendimentoId: string) => {
    try {
      await iniciarAtendimento.mutateAsync({
        lojaId: activeLojaId!,
        atendimentoId,
        data: { situacao: "EM_ATENDIMENTO" },
      });
      await queryClient.invalidateQueries({
        queryKey: getListAtendimentosQueryKey(activeLojaId!),
      });
      toast({ title: "Atendimento iniciado" });
    } catch (err) {
      toast({
        title: "Essa mudança não é possível agora",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  // A agenda de HOJE, em ordem de horário — o que a recepcionista folheia.
  const deHoje = useMemo(() => {
    // O dia da LOJA (E111): a meia-noite do fuso do navegador desloca a agenda
    // inteira para quem abre o painel com o relógio fora de São Paulo.
    const hoje = hojeLocal();
    const inicioHoje = inicioDoDia(hoje).getTime();
    const fimHoje = inicioDoDia(addDias(hoje, 1)).getTime();
    return [...(atendimentosQuery.data ?? [])]
      .filter((a) => {
        const t = new Date(a.inicio).getTime();
        return t >= inicioHoje && t < fimHoje;
      })
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  }, [atendimentosQuery.data]);

  // As noivas esfriando — a mesma régua, calculada no banco (E79).
  const precisamContato = (paradosQuery.data?.itens ?? []).slice(0, 5);

  const primeiroNome = user?.nome?.split(" ")[0];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-serif">Seu dia</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-10 bg-muted/50 rounded-t-lg"></CardHeader>
              <CardContent className="h-20"></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const comissaoDoMes = minhaComissao.data;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">
            {primeiroNome ? `Seu dia, ${primeiroNome}` : "Seu dia"}
          </h1>
          <p className="text-muted-foreground">O que precisa da sua atenção agora.</p>
        </div>
      </div>

      {/* Acima dos números: se o caixa vai furar, é a primeira coisa a saber. */}
      <AlertaCaixa />

      {/* F7: o painel promete "o que precisa da sua atenção agora" e não
          mencionava a única tela que responde isso. O número é o MESMO da fila,
          por construção (`lib/mensagens-do-dia`), e o cartão some quando ela
          está vazia — a disciplina do AlertaCaixa. */}
      {filaDeMensagens && (
        <Link to={`/loja/${activeLojaId}/mensagens`} className="block">
          <Card className="hover-elevate border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{filaDeMensagens.frase}</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Presenças a confirmar, cobranças e orçamentos vencendo — com o
                  WhatsApp pronto. Desça a fila clicando.
                </p>
              </div>
              <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
            </CardHeader>
          </Card>
        </Link>
      )}

      {/* E121/C3 — os contadores e o dinheiro saem da MESMA query: falhou,
          é UMA notícia com saída, não seis zeros que parecem medição. O ramo
          é o mesmo que os vizinhos do arquivo ("Hoje na loja", "Precisam de
          contato") já tinham. */}
      {painelQuery.isError ? (
        <Erro
          titulo="Os números do painel não carregaram"
          erro={painelQuery.error}
          onTentarNovamente={() => void painelQuery.refetch()}
        />
      ) : (
        <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {veLeads && (
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Noivas ativas</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.totalLeadsAtivos || 0}</div>
              <p className="text-xs text-muted-foreground">No funil</p>
            </CardContent>
          </Card>
        )}

        {veAgenda && (
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Atendimentos hoje</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.atendimentosHoje || 0}</div>
              <p className="text-xs text-muted-foreground">Agendados</p>
            </CardContent>
          </Card>
        )}

        {veLeads && (
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Orçamentos abertos</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.totalOrcamentosAbertos || 0}</div>
              <p className="text-xs text-muted-foreground">Aguardando resposta</p>
            </CardContent>
          </Card>
        )}

        {veLeads && (
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contratos fechados</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.totalContratosAtivos || 0}</div>
              <p className="text-xs text-muted-foreground">Ativos</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* O dinheiro do horizonte — a linha que a dona procura ao abrir. */}
      {veFinanceiro && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to={`/loja/${activeLojaId}/financeiro/receber`}>
            <Card className="hover-elevate cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  A receber — próximos 30 dias
                </CardTitle>
                <ArrowDownToLine className="h-4 w-4 text-positivo" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-positivo">
                  {brl(dashboard?.receberProximos30Dias ?? 0)}
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to={`/loja/${activeLojaId}/financeiro/pagar`}>
            <Card className="hover-elevate cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  A pagar — próximos 30 dias
                </CardTitle>
                <ArrowUpFromLine className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {brl(dashboard?.pagarProximos30Dias ?? 0)}
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}
        </>
      )}

      {/* A vendedora vê o próprio mês sem sair do painel (E11/E51). O card
          some quando NÃO HÁ REGRA (decisão do E11); a falha da query deixou
          de usar o mesmo silêncio — falha tem frase e saída (E121/C3). */}
      {minhaComissao.isError ? (
        <Erro
          titulo="Sua comissão do mês não carregou"
          erro={minhaComissao.error}
          onTentarNovamente={() => void minhaComissao.refetch()}
        />
      ) : comissaoDoMes?.temRegra && (
        <Link to={`/loja/${activeLojaId}/minha-comissao`}>
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Minha comissão neste mês
              </CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div className="text-2xl font-bold">{brl(comissaoDoMes.valorTotal)}</div>
              <p className="text-xs text-muted-foreground">
                {brl(comissaoDoMes.totalVendas)} em vendas
                {comissaoDoMes.faltaProximoDegrau !== null &&
                  comissaoDoMes.faltaProximoDegrau !== undefined &&
                  ` · faltam ${brl(comissaoDoMes.faltaProximoDegrau)} para o próximo degrau`}
              </p>
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {veAgenda && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Hoje na loja
              </CardTitle>
            </CardHeader>
            <CardContent>
              {atendimentosQuery.isError ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Não foi possível carregar a agenda.
                </div>
              ) : atendimentosQuery.isLoading ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-md" />)}
                </div>
              ) : deHoje.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Nenhum atendimento hoje.{" "}
                  <Link to={`/loja/${activeLojaId}/agenda`} className="text-primary underline underline-offset-4">
                    Abrir a agenda
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {deHoje.map((atendimento) => (
                    <li key={atendimento.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {/* F10: o nome era texto morto na tela que a
                            recepcionista folheia de manhã — para abrir a ficha
                            de quem chegou, ela ia à sidebar e buscava por nome,
                            com a noiva na porta. */}
                        <p className="text-sm font-medium truncate">
                          <span className="tabular-nums text-muted-foreground">
                            {instanteHora(atendimento.inicio)}
                          </span>{" "}
                          <Link
                            to={`/loja/${activeLojaId}/noivas/${atendimento.leadId}`}
                            className="hover:underline"
                          >
                            {atendimento.lead?.noivaNome ?? "Noiva"}
                          </Link>{" "}
                          — {atendimento.tipo === "PROVA" ? "Prova" : "Atendimento"}
                        </p>
                      </div>
                      {/* Iniciar é o gesto do momento em que ela chega, e ele
                          morava só na fila de atendimentos. Mesma rota, mesmo
                          gate (`agenda.editar`). */}
                      {podeEditarAgenda && atendimento.situacao === "AGENDADO" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={iniciarAtendimento.isPending}
                          onClick={() => iniciar(atendimento.id)}
                          data-testid={`iniciar-${atendimento.id}`}
                        >
                          Iniciar
                        </Button>
                      )}
                      <Badge
                        variant={
                          atendimento.situacao === "FALTOU"
                            ? "outline"
                            : atendimento.situacao === "CONCLUIDO"
                              ? "secondary"
                              : "default"
                        }
                        className="shrink-0 font-normal"
                      >
                        {atendimento.situacao === "AGENDADO" && "Agendado"}
                        {atendimento.situacao === "EM_ATENDIMENTO" && "Em atendimento"}
                        {atendimento.situacao === "CONCLUIDO" && "Concluído"}
                        {atendimento.situacao === "FALTOU" && "Faltou"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {veLeads && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-primary" />
                Precisam de contato
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paradosQuery.isError ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Não foi possível carregar as noivas.
                </div>
              ) : paradosQuery.isLoading ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-md" />)}
                </div>
              ) : precisamContato.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Ninguém esfriando — todos os contatos em dia.
                </div>
              ) : (
                <ul className="space-y-3">
                  {precisamContato.map((p) => (
                    <li key={p.id}>
                      <Link to={`/loja/${activeLojaId}/noivas/${p.id}`}>
                        <div className="flex items-center justify-between hover-elevate rounded-md px-2 py-1 -mx-2 cursor-pointer">
                          <div>
                            <p className="text-sm font-medium">{p.noivaNome}</p>
                            <p className="text-xs text-muted-foreground">
                              {etapaLabel(p.etapa)}
                              {p.casamentoData && ` · ${diaMesAno(p.casamentoData)}`}
                            </p>
                          </div>
                          <Badge
                            variant={p.temperatura === "critico" ? "destructive" : "secondary"}
                            className="font-normal"
                          >
                            {p.dias === 1 ? "Parada há 1 dia" : `Parada há ${p.dias} dias`}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
