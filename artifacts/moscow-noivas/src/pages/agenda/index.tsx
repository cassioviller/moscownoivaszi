import { useAuth } from "@/hooks/use-auth";
import { useListAtendimentos, useListCabines, useGetDisponibilidade, useListAjustes, getListAtendimentosQueryKey, getListCabinesQueryKey, getGetDisponibilidadeQueryKey, getListAjustesQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Clock, Plus } from "lucide-react";

export default function Agenda() {
  const { activeLojaId } = useAuth();
  const { data: atendimentos, isLoading: isLoadingAtendimentos } = useListAtendimentos(activeLojaId!, { query: { queryKey: getListAtendimentosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: cabines } = useListCabines(activeLojaId!, { query: { queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const primeiroAtendimentoId = atendimentos?.[0]?.id;
  const { data: ajustes } = useListAjustes(primeiroAtendimentoId!, { query: { queryKey: getListAjustesQueryKey(primeiroAtendimentoId!), enabled: !!primeiroAtendimentoId } });
  const { data: disponibilidade } = useGetDisponibilidade(activeLojaId!, { query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Agenda</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Atendimentos do Dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingAtendimentos ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-md" />)}
              </div>
            ) : atendimentos?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum atendimento agendado para hoje.</div>
            ) : (
              atendimentos?.map(atendimento => (
                <div key={atendimento.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{atendimento.tipo}</p>
                      <p className="text-sm text-muted-foreground">{new Date(atendimento.inicio).toLocaleString()}</p>
                    </div>
                  </div>
                  <Badge>{atendimento.situacao}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cabines</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {cabines?.map(cabine => (
                  <li key={cabine.id} className="flex items-center justify-between text-sm">
                    <span>{cabine.nome}</span>
                    <Badge variant={cabine.ativo ? "default" : "secondary"}>{cabine.ativo ? 'Ativa' : 'Inativa'}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ajustes Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              {ajustes?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">Nenhum ajuste pendente.</p>
              ) : (
                <ul className="space-y-3">
                  {ajustes?.filter(a => a.status === 'PENDENTE').map(ajuste => (
                    <li key={ajuste.id} className="text-sm border-b pb-2 last:border-0">
                      {ajuste.descricao}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
