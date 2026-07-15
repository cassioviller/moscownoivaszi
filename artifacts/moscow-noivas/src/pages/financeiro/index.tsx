import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListContasPagar,
  getListContasPagarQueryKey,
  useListSalariosRecorrentes,
  getListSalariosRecorrentesQueryKey,
  useListSaldoReferencia,
  getListSaldoReferenciaQueryKey,
  useListEquipe,
  getListEquipeQueryKey,
  useReceberParcela,
  usePagarContaPagar,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function ErroListagem({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Erro ao carregar</AlertTitle>
      <AlertDescription className="flex items-center gap-3">
        <span>{mensagem}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function Financeiro() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const parcelas = useListParcelas(activeLojaId!, { query: { queryKey: getListParcelasQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const contasPagar = useListContasPagar(activeLojaId!, { query: { queryKey: getListContasPagarQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const salarios = useListSalariosRecorrentes(activeLojaId!, { query: { queryKey: getListSalariosRecorrentesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const saldos = useListSaldoReferencia(activeLojaId!, { query: { queryKey: getListSaldoReferenciaQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const equipe = useListEquipe(activeLojaId!, { query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  const receberParcela = useReceberParcela();
  const pagarConta = usePagarContaPagar();

  const nomePorUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const membro of equipe.data ?? []) mapa.set(membro.usuarioId, membro.nome);
    return mapa;
  }, [equipe.data]);

  const parcelasAbertas = (parcelas.data ?? []).filter((p) => p.status === "PREVISTA");

  async function onReceber(parcelaId: string, valorPrevisto: number) {
    try {
      await receberParcela.mutateAsync({
        lojaId: activeLojaId!,
        parcelaId,
        data: { valorRecebido: valorPrevisto, recebidoEm: new Date().toISOString() },
      });
      await queryClient.invalidateQueries({ queryKey: getListParcelasQueryKey(activeLojaId!) });
      toast({ title: "Parcela recebida" });
    } catch (err) {
      toast({
        title: "Erro ao receber parcela",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function onPagar(contaId: string, valorPrevisto: number) {
    try {
      await pagarConta.mutateAsync({
        lojaId: activeLojaId!,
        contaId,
        data: { data: new Date().toISOString(), valorPago: valorPrevisto },
      });
      await queryClient.invalidateQueries({ queryKey: getListContasPagarQueryKey(activeLojaId!) });
      toast({ title: "Conta paga" });
    } catch (err) {
      toast({
        title: "Erro ao pagar conta",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif">Financeiro</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Parcelas a Receber</CardTitle>
          </CardHeader>
          <CardContent>
            {parcelas.isError ? (
              <ErroListagem mensagem="Falha ao buscar as parcelas." onRetry={() => parcelas.refetch()} />
            ) : parcelasAbertas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma parcela em aberto.</p>
            ) : (
              <ul className="space-y-3">
                {parcelasAbertas.map((parcela) => (
                  <li key={parcela.id} className="flex items-center justify-between gap-3 border-b pb-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {parcela.numero === 0 ? "Entrada" : parcela.descricao || `Parcela ${parcela.numero}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vence em {format(new Date(parcela.vencimento), "dd/MM/yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-primary whitespace-nowrap">R$ {brl(parcela.valorPrevisto)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={receberParcela.isPending}
                        onClick={() => onReceber(parcela.id, parcela.valorPrevisto)}
                      >
                        Receber
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contas a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            {contasPagar.isError ? (
              <ErroListagem mensagem="Falha ao buscar as contas." onRetry={() => contasPagar.refetch()} />
            ) : (contasPagar.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma conta pendente.</p>
            ) : (
              <ul className="space-y-3">
                {contasPagar.data?.map((conta) => (
                  <li key={conta.id} className="flex items-center justify-between gap-3 border-b pb-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{conta.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence em {format(new Date(conta.vencimento), "dd/MM/yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-destructive whitespace-nowrap">R$ {brl(conta.valorPrevisto)}</span>
                      {conta.status === "PAGA" ? (
                        <Badge variant="secondary">Paga</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pagarConta.isPending}
                          onClick={() => onPagar(conta.id, conta.valorPrevisto)}
                        >
                          Pagar
                        </Button>
                      )}
                    </div>
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
            {salarios.isError ? (
              <ErroListagem mensagem="Falha ao buscar os salários." onRetry={() => salarios.refetch()} />
            ) : (salarios.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum salário configurado.</p>
            ) : (
              <ul className="space-y-3">
                {salarios.data?.map((salario) => (
                  <li key={salario.id} className="flex justify-between border-b pb-2">
                    <span>{nomePorUsuario.get(salario.usuarioId) ?? "Colaborador"}</span>
                    <span className="font-semibold">R$ {brl(salario.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saldos de Referência</CardTitle>
          </CardHeader>
          <CardContent>
            {saldos.isError ? (
              <ErroListagem mensagem="Falha ao buscar os saldos." onRetry={() => saldos.refetch()} />
            ) : (saldos.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum saldo registrado.</p>
            ) : (
              <ul className="space-y-3">
                {saldos.data?.map((saldo) => (
                  <li key={saldo.id} className="flex justify-between border-b pb-2">
                    <span>Competência: {saldo.competencia}</span>
                    <span className="font-semibold">R$ {brl(saldo.valor)}</span>
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
