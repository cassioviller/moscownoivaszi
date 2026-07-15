import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListComissaoFaixas,
  getListComissaoFaixasQueryKey,
  useCreateComissaoFaixa,
  useDeleteComissaoFaixa,
  useListComissaoFechamentos,
  getListComissaoFechamentosQueryKey,
  useGerarComissaoFechamento,
  getListContasPagarQueryKey,
  useListEquipe,
  getListEquipeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

/** Competência corrente "YYYY-MM" (default do campo de fechamento). */
function competenciaAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
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

export default function Comissoes() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const faixas = useListComissaoFaixas(activeLojaId!, { query: { queryKey: getListComissaoFaixasQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const fechamentos = useListComissaoFechamentos(activeLojaId!, { query: { queryKey: getListComissaoFechamentosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const equipe = useListEquipe(activeLojaId!, { query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId } });

  const criarFaixa = useCreateComissaoFaixa();
  const excluirFaixa = useDeleteComissaoFaixa();
  const gerarFechamento = useGerarComissaoFechamento();

  const [novoMinimo, setNovoMinimo] = useState("");
  const [novoPercentual, setNovoPercentual] = useState("");
  const [competencia, setCompetencia] = useState(competenciaAtual());

  const nomePorUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const membro of equipe.data ?? []) mapa.set(membro.usuarioId, membro.nome);
    return mapa;
  }, [equipe.data]);

  async function onCriarFaixa() {
    const minimoVenda = Number(novoMinimo);
    const percentual = Number(novoPercentual);
    if (!Number.isFinite(minimoVenda) || !Number.isFinite(percentual)) {
      toast({ title: "Preencha mínimo e percentual", variant: "destructive" });
      return;
    }
    try {
      await criarFaixa.mutateAsync({ lojaId: activeLojaId!, data: { minimoVenda, percentual } });
      await queryClient.invalidateQueries({ queryKey: getListComissaoFaixasQueryKey(activeLojaId!) });
      setNovoMinimo("");
      setNovoPercentual("");
      toast({ title: "Faixa criada" });
    } catch (err) {
      toast({ title: "Erro ao criar faixa", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  async function onExcluirFaixa(faixaId: string) {
    try {
      await excluirFaixa.mutateAsync({ lojaId: activeLojaId!, faixaId });
      await queryClient.invalidateQueries({ queryKey: getListComissaoFaixasQueryKey(activeLojaId!) });
    } catch (err) {
      toast({ title: "Erro ao excluir faixa", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  async function onGerarFechamento() {
    try {
      const criados = await gerarFechamento.mutateAsync({ lojaId: activeLojaId!, data: { competencia } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListComissaoFechamentosQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getListContasPagarQueryKey(activeLojaId!) }),
      ]);
      toast({ title: `Fechamento de ${competencia} gerado`, description: `${criados.length} vendedora(s)` });
    } catch (err) {
      toast({
        title: "Erro ao gerar fechamento",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif">Comissões</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Regras de Comissão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              A maior faixa atingida define o percentual aplicado ao total vendido na competência.
            </p>
            {faixas.isError ? (
              <ErroListagem mensagem="Falha ao buscar as faixas." onRetry={() => faixas.refetch()} />
            ) : (faixas.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma faixa definida — comissão será 0%.</p>
            ) : (
              <ul className="space-y-2">
                {faixas.data?.map((faixa) => (
                  <li key={faixa.id} className="flex items-center justify-between border-b pb-2 text-sm">
                    <span>
                      A partir de <span className="font-medium">R$ {brl(faixa.minimoVenda)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-primary">{faixa.percentual}%</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir faixa"
                        disabled={excluirFaixa.isPending}
                        onClick={() => onExcluirFaixa(faixa.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Mínimo de venda (R$)</label>
                <Input inputMode="decimal" value={novoMinimo} onChange={(e) => setNovoMinimo(e.target.value)} placeholder="10000" />
              </div>
              <div className="w-28">
                <label className="text-xs text-muted-foreground">Percentual (%)</label>
                <Input inputMode="decimal" value={novoPercentual} onChange={(e) => setNovoPercentual(e.target.value)} placeholder="5" />
              </div>
              <Button onClick={onCriarFaixa} disabled={criarFaixa.isPending}>
                Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fechamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="w-40">
                <label className="text-xs text-muted-foreground">Competência</label>
                <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
              </div>
              <Button onClick={onGerarFechamento} disabled={gerarFechamento.isPending || !competencia}>
                Gerar fechamento
              </Button>
            </div>
            {fechamentos.isError ? (
              <ErroListagem mensagem="Falha ao buscar os fechamentos." onRetry={() => fechamentos.refetch()} />
            ) : (fechamentos.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum fechamento realizado.</p>
            ) : (
              <ul className="space-y-3">
                {fechamentos.data?.map((fechamento) => (
                  <li key={fechamento.id} className="flex justify-between items-center border-b pb-2">
                    <div>
                      <div className="font-medium">{fechamento.competencia}</div>
                      <div className="text-sm text-muted-foreground">
                        {nomePorUsuario.get(fechamento.usuarioId) ?? "Vendedora"} — vendas R$ {brl(fechamento.totalVendas)}
                      </div>
                    </div>
                    <div className="font-semibold text-primary">R$ {brl(fechamento.comissaoValor)}</div>
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
