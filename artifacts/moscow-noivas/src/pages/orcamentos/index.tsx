import { useAuth } from "@/hooks/use-auth";
import { useListOrcamentos, getListOrcamentosQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";

export default function Orcamentos() {
  const { activeLojaId } = useAuth();
  const { data: orcamentos, isLoading } = useListOrcamentos(activeLojaId!, { query: { queryKey: getListOrcamentosQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Orçamentos</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Orçamento
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          [1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse" />)
        ) : orcamentos?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">Nenhum orçamento encontrado.</div>
        ) : (
          orcamentos?.map(orcamento => (
            <Link key={orcamento.id} href={`/orcamentos/${orcamento.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center text-secondary-foreground">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">Orçamento para Lead: {orcamento.leadId.slice(0,8)}</div>
                      <div className="text-sm text-muted-foreground">Criado em {new Date(orcamento.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <Badge>{orcamento.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
