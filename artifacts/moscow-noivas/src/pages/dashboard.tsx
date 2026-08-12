import { varianteSituacao } from "@/lib/status-badge";
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
  useListAjustes,
  useListAceitosSemContrato,
  getListAceitosSemContratoQueryKey,
  getListAjustesQueryKey,
  useUpdateAtendimento,
} from "@workspace/api-client-react";
import { ajustesComPrazoApertado } from "@/lib/ajustes-prazo";
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
  Scissors,
  Signature,
} from "lucide-react";
import { diaMesAno, etapaLabel, instanteHora } from "@/lib/formatos";
import { brl } from "@/lib/formatos";
import { AlertaCaixa } from "@/components/alerta-caixa";
import { Erro } from "@/components/estado";
import { estadoDasConsultas } from "@/lib/estado-consulta";
import { podeNoModulo } from "@/lib/permissoes";
import { mensagemApi } from "@/lib/erro-api";

import { competenciaAtual, hojeLocal, addDias, inicioDoDia, diaLocal } from "@/lib/financeiro/datas";
import { agingDeParcelas } from "@/lib/financeiro/cobranca";
import {
  aContatarNaJanela,
  orcamentosVencendoNaJanela,
  marcasPersistentesDeCobranca,
  particionaPorCobranca,
  resumoDaFila,
} from "@/lib/mensagens-do-dia";

/**
 * S-D10 — as descrições dos dois cartões de aviso são FIXAS, e ficam aqui
 * porque o esqueleto que reserva o lugar deles usa a MESMA frase. É o que faz
 * a caixa do esqueleto bater com a do cartão em qualquer largura: a 390px a
 * frase da fila quebra em 3 linhas, e um esqueleto de altura fixa erraria por
 * 40px justamente onde o salto dói.
 */
const DESCRICAO_FILA =
  "Presenças a confirmar, cobranças e orçamentos vencendo — com o WhatsApp pronto. Desça a fila clicando.";
const DESCRICAO_FILA_INCOMPLETA =
  "Parte da fila não carregou, então o número aqui não sairia certo. A fila mostra o que já dá para ver.";
const DESCRICAO_AJUSTES = "Prova mais próxima primeiro — a fila diz peça, noiva e prazo.";

/**
 * O lugar do cartão de aviso, RESERVADO enquanto as consultas dele contam.
 *
 * O painel destrava com **1** das 8 consultas desta tela — o `useGetDashboard`
 * do `painelQuery`, e as outras 7 são os 6 hooks abaixo dele mais o
 * `useGetAlertaCaixa` do `<AlertaCaixa />`. Os dois cartões do topo dependem de
 * **4** delas, e o esqueleto de abertura não cobre nenhuma das 4. Sem
 * reserva, eles se inserem ACIMA dos quatro contadores segundos depois de a
 * página pintar — e os contadores são links desde o E132/B8, então o dedo que
 * já estava a caminho de "Noivas ativas" cai no cartão que acabou de nascer.
 *
 * O esqueleto repete a estrutura do cabeçalho do cartão (título de uma linha +
 * a frase fixa, invisível), então a troca esqueleto → cartão não move um pixel.
 */
function AvisoCarregando({ descricao }: { descricao: string }) {
  return (
    <Card className="animate-pulse" aria-busy="true" aria-label="Contando os avisos do dia">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="bg-muted h-4 w-56 max-w-full rounded" />
          <p className="invisible mt-0.5 text-sm" aria-hidden="true">
            {descricao}
          </p>
        </div>
        <div className="bg-muted h-5 w-5 shrink-0 rounded-full" />
      </CardHeader>
    </Card>
  );
}

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

  /**
   * E132/D10 — a 4ª persona do E66 não tinha cartão: a costureira logava e
   * nada dizia dos ajustes vencendo. A MESMA query e a MESMA régua da fila
   * (`lib/ajustes-prazo`) — o número do cartão é o da fila por construção
   * (a disciplina do F7); o gate é o do servidor (módulo agenda), via
   * `lib/permissoes`, e o cartão some quando não há nada.
   */
  const ajustesQuery = useListAjustes(activeLojaId!, {
    query: {
      queryKey: getListAjustesQueryKey(activeLojaId!),
      enabled: !!activeLojaId && veAgenda,
    },
  });
  const ajustesApertados = useMemo(
    () => ajustesComPrazoApertado(ajustesQuery.data ?? []),
    [ajustesQuery.data],
  );

  /**
   * E162 (A01.5/A04.1) — a fila do gate no painel do Renato.
   *
   * O aceite tirava o orçamento da fila de "vencendo em 72h" e o punha num
   * estado que NENHUMA tela vigiava: o "sim" da noiva com o vestido solto, e
   * o tempo até alguém notar era ilimitado. O cartão diz o dinheiro parado e
   * a idade do mais antigo — as duas medidas que o achado A04.2 provou não
   * existirem em consulta nenhuma. Some quando vazio (disciplina do F7).
   */
  const aceitosQuery = useListAceitosSemContrato(activeLojaId!, {
    query: {
      queryKey: getListAceitosSemContratoQueryKey(activeLojaId!),
      enabled: !!activeLojaId && veLeads,
    },
  });
  const aceitosParados = aceitosQuery.data ?? [];
  const valorParado = useMemo(
    () => aceitosParados.reduce((s, a) => s + a.valor, 0),
    [aceitosParados],
  );
  const idadeMaisAntigo = useMemo(() => {
    if (aceitosParados.length === 0) return 0;
    const maisAntigo = new Date(aceitosParados[0].aprovadoEm).getTime();
    return Math.floor((Date.now() - maisAntigo) / (24 * 3_600_000));
  }, [aceitosParados]);

  const filaDeMensagens = useMemo(() => {
    const agora = Date.now();
    const aContatar = aContatarNaJanela(atendimentosQuery.data ?? [], agora).length;
    /**
     * S-M26 (rodada 2, achado 7#3): o cartão somava TODAS as inadimplentes
     * enquanto /mensagens aplica a S-D13 — noiva já cobrada no dia de hoje da
     * loja sai de `aCobrar`. A recepcionista cobrava 4 noivas pela fila,
     * voltava, e o cartão seguia dizendo "9 mensagens" com a fila mostrando 5
     * — a divergência exata que o F7 declarou ser pior que não contar. O dado
     * sempre esteve em mãos (`agingDeParcelas` devolve `ultimoContatoEm` por
     * noiva); a composição é a MESMA de mensagens/index.tsx.
     */
    const inadimplentes = agingDeParcelas(parcelasAbertas.data ?? []).noivas;
    const persistentes = marcasPersistentesDeCobranca(inadimplentes, hojeLocal(), diaLocal);
    const emAtraso = particionaPorCobranca(inadimplentes, persistentes).aCobrar.length;
    // S-M25: a validade é dia de negócio — a janela conta DIAS locais.
    const vencendo = orcamentosVencendoNaJanela(orcamentosEnviados.data?.itens ?? [], hojeLocal()).length;
    return resumoDaFila(aContatar + emAtraso + vencendo);
  }, [atendimentosQuery.data, parcelasAbertas.data, orcamentosEnviados.data]);

  /**
   * S-D10 — o estado das TRÊS consultas que somam o número do cartão, na
   * decisão que o E121 já extraiu (`lib/estado-consulta`, e consulta desligada
   * por permissão não conta).
   *
   * Ele resolve duas coisas de uma vez. **Carregando** reserva o lugar em vez
   * de deixar o cartão saltar. E **erro** tira o NÚMERO da tela: as três
   * parcelas do total entram por `?? []`, então uma consulta falhada não
   * zerava o cartão — ela o fazia prometer 3 com 5 esperando na fila, que é
   * exatamente a divergência que `lib/mensagens-do-dia` existe para impedir.
   */
  const estadoDaFila = estadoDasConsultas(
    atendimentosQuery,
    parcelasAbertas,
    orcamentosEnviados,
  );
  const avisoDaFila =
    estadoDaFila === "erro"
      ? { frase: "A fila do dia não pôde ser contada", descricao: DESCRICAO_FILA_INCOMPLETA }
      : filaDeMensagens
        ? { frase: filaDeMensagens.frase, descricao: DESCRICAO_FILA }
        : null;

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
          está vazia — a disciplina do AlertaCaixa.

          S-D10: enquanto as três consultas contam, o lugar fica reservado. O
          cartão saía do nada segundos depois da pintura, ACIMA dos quatro
          contadores — 108px de empurrão (a caixa do cabeçalho, 76px, mais os
          32px do `space-y-8`), e mais que isso a 390px, onde a descrição
          quebra em três linhas. */}
      {estadoDaFila === "carregando" ? (
        <AvisoCarregando descricao={DESCRICAO_FILA} />
      ) : avisoDaFila ? (
        <Link to={`/loja/${activeLojaId}/mensagens`} className="block">
          <Card className="hover-elevate border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{avisoDaFila.frase}</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">{avisoDaFila.descricao}</p>
              </div>
              <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
            </CardHeader>
          </Card>
        </Link>
      ) : null}

      {/* E132/D10: o cartão da costureira — some quando vazio (a disciplina
          do AlertaCaixa e do cartão de mensagens acima). Ele nasceu DEPOIS da
          S-D10 e com a mesma ausência: são dois saltos no mesmo lugar da tela,
          e por isso a reserva vale para os dois. */}
      {ajustesQuery.isLoading ? (
        <AvisoCarregando descricao={DESCRICAO_AJUSTES} />
      ) : ajustesApertados.length > 0 ? (
        <Link to={`/loja/${activeLojaId}/ajustes`} className="block">
          <Card className="hover-elevate border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base">
                  {ajustesApertados.length === 1
                    ? "1 ajuste com o prazo apertado"
                    : `${ajustesApertados.length} ajustes com o prazo apertado`}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">{DESCRICAO_AJUSTES}</p>
              </div>
              <Scissors className="h-5 w-5 shrink-0 text-primary" />
            </CardHeader>
          </Card>
        </Link>
      ) : null}

      {/* E162: o aceite parado é a notícia mais cara do painel — dinheiro já
          comprometido pela noiva esperando alguém gerar o contrato. */}
      {aceitosParados.length > 0 ? (
        <Link to={`/loja/${activeLojaId}/orcamentos`} className="block">
          <Card className="hover-elevate border-primary/40" data-testid="card-aceitos-sem-contrato">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base">
                  {aceitosParados.length === 1
                    ? `1 aceite esperando contrato — ${brl(valorParado)} parados`
                    : `${aceitosParados.length} aceites esperando contrato — ${brl(valorParado)} parados`}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {idadeMaisAntigo === 0
                    ? "O mais antigo é de hoje — a noiva já disse sim; falta o contrato."
                    : `O mais antigo espera há ${idadeMaisAntigo} dia${idadeMaisAntigo === 1 ? "" : "s"} — a noiva já disse sim; falta o contrato.`}
                </p>
              </div>
              <Signature className="h-5 w-5 shrink-0 text-primary" />
            </CardHeader>
          </Card>
        </Link>
      ) : null}

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
      {/* E132/B8: metade dos cartões navegava e metade era morta com a MESMA
          cara — `hover-elevate` promete clique. Cada contador leva ao seu
          destino óbvio, como os cards de dinheiro logo abaixo já faziam. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {veLeads && (
          <Link to={`/loja/${activeLojaId}/noivas`}>
            <Card className="hover-elevate cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Noivas ativas</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard?.totalLeadsAtivos || 0}</div>
                <p className="text-xs text-muted-foreground">No funil</p>
              </CardContent>
            </Card>
          </Link>
        )}

        {veAgenda && (
          <Link to={`/loja/${activeLojaId}/atendimentos`}>
            <Card className="hover-elevate cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Atendimentos hoje</CardTitle>
                <Calendar className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard?.atendimentosHoje || 0}</div>
                <p className="text-xs text-muted-foreground">Agendados</p>
              </CardContent>
            </Card>
          </Link>
        )}

        {veLeads && (
          <Link to={`/loja/${activeLojaId}/orcamentos`}>
            <Card className="hover-elevate cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Orçamentos abertos</CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard?.totalOrcamentosAbertos || 0}</div>
                <p className="text-xs text-muted-foreground">Aguardando resposta</p>
              </CardContent>
            </Card>
          </Link>
        )}

        {veLeads && (
          <Link to={`/loja/${activeLojaId}/contratos`}>
            <Card className="hover-elevate cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Contratos fechados</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard?.totalContratosAtivos || 0}</div>
                <p className="text-xs text-muted-foreground">Ativos</p>
              </CardContent>
            </Card>
          </Link>
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
                <div className="money-lg text-positivo">
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
                <div className="money-lg">
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
              <div className="money-lg">{brl(comissaoDoMes.valorTotal)}</div>
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
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Hoje na loja
              </CardTitle>
              {/* E132/D9: o card listava os atendimentos sem caminho para a
                  fila — para concluir com desfecho a recepcionista pagava
                  sidebar + busca, todo dia. A língua é a do A3: link-seta. */}
              <Link
                to={`/loja/${activeLojaId}/atendimentos`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Fila de atendimentos →
              </Link>
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
                  <Link to={`/loja/${activeLojaId}/agenda`} className="text-primary-texto underline underline-offset-4">
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
                      {/* E130/A1: a variante vem da tabela semântica — era um
                          mapeamento próprio desta tela (Agendado rosa aqui,
                          cinza na fila). */}
                      <Badge
                        variant={varianteSituacao(atendimento.situacao)}
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
