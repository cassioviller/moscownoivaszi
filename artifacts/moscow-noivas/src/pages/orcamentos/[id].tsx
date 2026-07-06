import { useAuth } from "@/hooks/use-auth";
import { useGetOrcamento, getGetOrcamentoQueryKey } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function OrcamentoDetail() {
  const [, params] = useRoute("/orcamentos/:id");
  const id = params?.id;

  const { data: orcamento, isLoading } = useGetOrcamento(id!, {
    query: { queryKey: getGetOrcamentoQueryKey(id!), enabled: !!id }
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;
  if (!orcamento) return <div>Orçamento não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Orçamento Detalhes</h1>
        <Badge className="text-sm px-3 py-1">{orcamento.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens do Orçamento</CardTitle>
        </CardHeader>
        <CardContent>
          {orcamento.itens && orcamento.itens.length > 0 ? (
            <ul className="space-y-4">
              {orcamento.itens.map(item => (
                <li key={item.id} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <p className="font-medium">{item.descricao}</p>
                    <p className="text-sm text-muted-foreground">Qtd: {item.quantidade} x R$ {item.valorUnitario.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="font-semibold">
                    R$ {(item.quantidade * item.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nenhum item adicionado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
