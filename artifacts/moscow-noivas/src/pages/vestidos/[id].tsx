import { useAuth } from "@/hooks/use-auth";
import { useGetVestido, getGetVestidoQueryKey } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function VestidoDetail() {
  const { activeLojaId } = useAuth();
  const [, params] = useRoute("/vestidos/:id");
  const id = params?.id;

  const { data: vestido, isLoading } = useGetVestido(activeLojaId!, id!, {
    query: { queryKey: getGetVestidoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;
  if (!vestido) return <div>Vestido não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-muted-foreground">{vestido.codigo}</div>
          <h1 className="text-3xl font-serif">{vestido.nome}</h1>
        </div>
        <Badge className="text-sm px-3 py-1">{vestido.status}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Preço Base</p>
                <p className="font-medium text-lg">R$ {vestido.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Categoria</p>
                <p className="font-medium">{vestido.categoria || 'Não definida'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tamanho</p>
                <p className="font-medium">{vestido.tamanho || 'Não definido'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cor</p>
                <p className="font-medium">{vestido.cor || 'Não definida'}</p>
              </div>
            </div>
            
            {vestido.observacoes && (
              <div>
                <p className="text-muted-foreground text-sm">Observações</p>
                <p className="text-sm mt-1">{vestido.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
