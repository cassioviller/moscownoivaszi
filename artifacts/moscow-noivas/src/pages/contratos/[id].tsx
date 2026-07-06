import { useAuth } from "@/hooks/use-auth";
import { useGetContrato, getGetContratoQueryKey } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ContratoDetail() {
  const [, params] = useRoute("/contratos/:id");
  const id = params?.id;

  const { data: contrato, isLoading } = useGetContrato(id!, {
    query: { queryKey: getGetContratoQueryKey(id!), enabled: !!id }
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;
  if (!contrato) return <div>Contrato não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Contrato #{contrato.id.slice(0,6)}</h1>
        <Badge variant={contrato.status === 'ATIVO' ? 'default' : 'destructive'} className="text-sm px-3 py-1">
          {contrato.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes Financeiros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-muted-foreground text-sm">Valor Total</span>
              <p className="text-2xl font-semibold text-primary">
                R$ {contrato.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-sm">Forma de Pagamento Base</span>
              <p className="font-medium">{contrato.formaPagamento || 'Não definida'}</p>
            </div>
            {contrato.cpf && (
              <div>
                <span className="text-muted-foreground text-sm">CPF Cliente</span>
                <p className="font-medium">{contrato.cpf}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parcelas</CardTitle>
          </CardHeader>
          <CardContent>
            {contrato.parcelas && contrato.parcelas.length > 0 ? (
              <ul className="space-y-3">
                {contrato.parcelas.map((parcela, i) => (
                  <li key={parcela.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-sm">Parcela {parcela.numero}</p>
                      <p className="text-xs text-muted-foreground">Venc: {new Date(parcela.vencimento).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">R$ {parcela.valorPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <Badge variant="outline" className="text-[10px]">{parcela.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma parcela registrada.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
