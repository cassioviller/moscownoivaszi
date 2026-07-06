import { useAuth } from "@/hooks/use-auth";
import { useListContratos, getListContratosQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ScrollText } from "lucide-react";

export default function Contratos() {
  const { activeLojaId } = useAuth();
  const { data: contratos, isLoading } = useListContratos(activeLojaId!, { query: { queryKey: getListContratosQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Contratos</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Contrato
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          [1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse" />)
        ) : contratos?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">Nenhum contrato encontrado.</div>
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
                      <div className="font-medium">Contrato #{contrato.id.slice(0,6)}</div>
                      <div className="text-sm text-muted-foreground">Fechado em: {new Date(contrato.fechadoEm).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="font-semibold">R$ {contrato.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
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
