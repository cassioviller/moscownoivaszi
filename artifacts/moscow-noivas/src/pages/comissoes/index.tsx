import { useAuth } from "@/hooks/use-auth";
import { useListComissaoRegras, useListComissaoFechamentos, getListComissaoRegrasQueryKey, getListComissaoFechamentosQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Comissoes() {
  const { activeLojaId } = useAuth();
  const { data: regras } = useListComissaoRegras(activeLojaId!, { query: { queryKey: getListComissaoRegrasQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: fechamentos } = useListComissaoFechamentos(activeLojaId!, { query: { queryKey: getListComissaoFechamentosQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif">Comissões</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Regras de Comissão</CardTitle>
          </CardHeader>
          <CardContent>
            {regras?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma regra definida.</p>
            ) : (
              <ul className="space-y-4">
                {regras?.map(regra => (
                  <li key={regra.id} className="border p-4 rounded-md">
                    <div className="font-medium text-lg">Vendedora: {regra.vendedoraId.slice(0, 6)}</div>
                    <Badge variant={regra.ativo ? "default" : "secondary"} className="mt-1">{regra.ativo ? 'Ativa' : 'Inativa'}</Badge>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Vigência a partir de: {new Date(regra.vigenciaInicio).toLocaleDateString('pt-BR')}
                      {regra.faixas && regra.faixas.length > 0 && ` • ${regra.faixas.length} faixa(s)`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fechamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {fechamentos?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum fechamento realizado.</p>
            ) : (
              <ul className="space-y-3">
                {fechamentos?.map(fechamento => (
                  <li key={fechamento.id} className="flex justify-between items-center border-b pb-2">
                    <div>
                      <div className="font-medium">Competência: {fechamento.competencia}</div>
                      <div className="text-sm text-muted-foreground">Vendedora: {fechamento.vendedoraId.slice(0, 6)}</div>
                    </div>
                    <div className="font-semibold text-primary">
                      R$ {fechamento.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
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
