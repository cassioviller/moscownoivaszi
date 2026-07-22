import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetLeadsParados,
  getGetLeadsParadosQueryKey,
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useGetMinhaComissao,
  getGetMinhaComissaoQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router";
import { format } from "date-fns";
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
} from "lucide-react";
import { dataDia, etapaLabel } from "@/lib/formatos";
import { brl } from "@/lib/formatos";
import { AlertaCaixa } from "@/components/alerta-caixa";
import { podeNoModulo } from "@/lib/permissoes";

import { competenciaAtual } from "@/lib/financeiro/datas";

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

  const { data: dashboard, isLoading } = useGetDashboard(activeLojaId!, {
    query: {
      queryKey: getGetDashboardQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    }
  });

  // E79: a régua do funil roda no banco — o painel pede só as contagens e as
  // 10 piores, não a lista completa de leads.
  const paradosQuery = useGetLeadsParados(activeLojaId!, {
    query: { queryKey: getGetLeadsParadosQueryKey(activeLojaId!), enabled: !!activeLojaId && veLeads },
  });
  const atendimentosQuery = useListAtendimentos(activeLojaId!, {
    query: { queryKey: getListAtendimentosQueryKey(activeLojaId!), enabled: !!activeLojaId && veAgenda },
  });

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

  // A agenda de HOJE, em ordem de horário — o que a recepcionista folheia.
  const deHoje = useMemo(() => {
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(inicioHoje);
    fimHoje.setDate(fimHoje.getDate() + 1);
    return [...(atendimentosQuery.data ?? [])]
      .filter((a) => {
        const t = new Date(a.inicio).getTime();
        return t >= inicioHoje.getTime() && t < fimHoje.getTime();
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {veLeads && (
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Noivas Ativas</CardTitle>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Atendimentos Hoje</CardTitle>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Orçamentos Abertos</CardTitle>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Contratos Fechados</CardTitle>
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

      {/* A vendedora vê o próprio mês sem sair do painel (E11/E51). */}
      {comissaoDoMes?.temRegra && (
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
                        <p className="text-sm font-medium truncate">
                          <span className="tabular-nums text-muted-foreground">
                            {format(new Date(atendimento.inicio), "HH:mm")}
                          </span>{" "}
                          {atendimento.lead?.noivaNome ?? "Noiva"} —{" "}
                          {atendimento.tipo === "PROVA" ? "Prova" : "Atendimento"}
                        </p>
                      </div>
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
                              {p.casamentoData && ` · ${dataDia(p.casamentoData)}`}
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
