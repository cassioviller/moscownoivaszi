import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListContratos,
  getListContratosQueryKey,
  useListLeads,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, ScrollText, AlertCircle } from "lucide-react";
import { brl } from "@/lib/formatos";

export default function Contratos() {
  const { activeLojaId } = useAuth();
  const [, setLocation] = useLocation();
  const { data: contratos, isLoading, isError, refetch } = useListContratos(activeLojaId!, { query: { queryKey: getListContratosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const leads = useListLeads(activeLojaId!, { query: { queryKey: getListLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  const nomePorLead = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const lead of leads.data ?? []) mapa.set(lead.id, lead.noivaNome);
    return mapa;
  }, [leads.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Contratos</h1>
        {/* Contrato nasce de um orçamento APROVADO — o botão leva ao funil certo. */}
        <Button onClick={() => setLocation("/orcamentos")}>
          <Plus className="h-4 w-4 mr-2" />
          Novo contrato (via orçamento)
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar os contratos</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              <span>Falha ao buscar os contratos.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          [1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse" />)
        ) : contratos?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">
            Nenhum contrato encontrado. Aprove um orçamento e gere o contrato a partir dele.
          </div>
        ) : (
          contratos?.map(contrato => (
            <Link key={contrato.id} href={`/contratos/${contrato.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                      <ScrollText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">{nomePorLead.get(contrato.leadId) ?? `Contrato #${contrato.id.slice(0, 6)}`}</div>
                      <div className="text-sm text-muted-foreground">
                        Contrato #{contrato.id.slice(0, 6)} • Fechado em {new Date(contrato.fechadoEm).toLocaleDateString("pt-BR")}
                        {contrato.dataCasamento && ` • Casamento ${new Date(contrato.dataCasamento).toLocaleDateString("pt-BR")}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="font-semibold">R$ {brl(contrato.valorTotal)}</div>
                    <Badge variant={contrato.status === 'ATIVO' ? 'default' : 'destructive'}>{contrato.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
