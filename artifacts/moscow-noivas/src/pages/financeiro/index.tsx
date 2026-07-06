import { useAuth } from "@/hooks/use-auth";
import { useListContasPagar, useListSalariosRecorrentes, useListSaldoReferencia, getListContasPagarQueryKey, getListSalariosRecorrentesQueryKey, getListSaldoReferenciaQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Financeiro() {
  const { activeLojaId } = useAuth();
  const { data: contasPagar } = useListContasPagar(activeLojaId!, { query: { queryKey: getListContasPagarQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: salarios } = useListSalariosRecorrentes(activeLojaId!, { query: { queryKey: getListSalariosRecorrentesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const { data: saldos } = useListSaldoReferencia(activeLojaId!, { query: { queryKey: getListSaldoReferenciaQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif">Financeiro</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Contas a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            {contasPagar?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma conta pendente.</p>
            ) : (
              <ul className="space-y-3">
                {contasPagar?.map(conta => (
                  <li key={conta.id} className="flex justify-between border-b pb-2">
                    <span className="font-medium">{conta.descricao}</span>
                    <span className="font-semibold text-destructive">R$ {conta.valorPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Salários Recorrentes</CardTitle>
          </CardHeader>
          <CardContent>
            {salarios?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum salário configurado.</p>
            ) : (
              <ul className="space-y-3">
                {salarios?.map(salario => (
                  <li key={salario.id} className="flex justify-between border-b pb-2">
                    <span>Colaborador: {salario.colaboradorId.slice(0, 6)}</span>
                    <span className="font-semibold">R$ {salario.valorBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Saldos de Referência</CardTitle>
          </CardHeader>
          <CardContent>
            {saldos?.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum saldo registrado.</p>
            ) : (
              <ul className="space-y-3">
                {saldos?.map(saldo => (
                  <li key={saldo.id} className="flex justify-between border-b pb-2">
                    <span>Data: {new Date(saldo.dataReferencia).toLocaleDateString('pt-BR')}</span>
                    <span className="font-semibold">R$ {saldo.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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
