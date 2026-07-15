import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useListLeads,
  getListLeadsQueryKey,
  useListAtendimentos,
  getListAtendimentosQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { format } from "date-fns";
import { Calendar, Users, FileText, CheckCircle2, TrendingUp, Clock } from "lucide-react";
import { etapaLabel } from "@/lib/formatos";

export default function Dashboard() {
  const { activeLojaId } = useAuth();

  // Only fetch if we have a lojaId
  const { data: dashboard, isLoading } = useGetDashboard(activeLojaId!, {
    query: {
      queryKey: getGetDashboardQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    }
  });

  const leadsQuery = useListLeads(activeLojaId!, {
    query: { queryKey: getListLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const atendimentosQuery = useListAtendimentos(activeLojaId!, {
    query: { queryKey: getListAtendimentosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  // Os cinco leads mais recentes (por data de criação).
  const leadsRecentes = useMemo(() => {
    return [...(leadsQuery.data ?? [])]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [leadsQuery.data]);

  // Atendimentos futuros, ordenados pelo horário mais próximo.
  const proximosAtendimentos = useMemo(() => {
    const agora = Date.now();
    return [...(atendimentosQuery.data ?? [])]
      .filter((a) => new Date(a.inicio).getTime() >= agora)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 5);
  }, [atendimentosQuery.data]);

  const nomePorLead = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const lead of leadsQuery.data ?? []) mapa.set(lead.id, lead.noivaNome);
    return mapa;
  }, [leadsQuery.data]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-serif">Visão Geral</h1>
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Visão Geral</h1>
          <p className="text-muted-foreground">Bem-vindo ao painel da sua loja.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Novos Leads</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.totalLeadsAtivos || 0}</div>
            <p className="text-xs text-muted-foreground">Ativos</p>
          </CardContent>
        </Card>

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Próximos Atendimentos
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
            ) : proximosAtendimentos.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                A agenda está vazia para os próximos dias.
              </div>
            ) : (
              <ul className="space-y-3">
                {proximosAtendimentos.map((atendimento) => (
                  <li key={atendimento.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {nomePorLead.get(atendimento.leadId) ?? "Noiva"} — {atendimento.tipo === "PROVA" ? "Prova" : "Atendimento"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(atendimento.inicio), "dd/MM 'às' HH:mm")}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Leads Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leadsQuery.isError ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Não foi possível carregar os leads.
              </div>
            ) : leadsQuery.isLoading ? (
              <div className="animate-pulse space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-md" />)}
              </div>
            ) : leadsRecentes.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhum lead novo recentemente.
              </div>
            ) : (
              <ul className="space-y-3">
                {leadsRecentes.map((lead) => (
                  <li key={lead.id}>
                    <Link href={`/leads/${lead.id}`}>
                      <div className="flex items-center justify-between hover-elevate rounded-md px-2 py-1 -mx-2 cursor-pointer">
                        <div>
                          <p className="text-sm font-medium">{lead.noivaNome}</p>
                          <p className="text-xs text-muted-foreground">
                            {lead.casamentoData
                              ? new Date(lead.casamentoData).toLocaleDateString("pt-BR")
                              : "Data não informada"}
                          </p>
                        </div>
                        <Badge variant={lead.etapa === "PERDIDO" ? "outline" : "secondary"}>
                          {etapaLabel(lead.etapa)}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
