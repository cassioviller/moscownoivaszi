import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetContrato,
  getGetContratoQueryKey,
  useCancelarContrato,
  getListContratosQueryKey,
  useListLeads,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/formatos";

const PARCELA_STATUS: Record<string, string> = {
  PREVISTA: "Prevista",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

export default function ContratoDetail() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/contratos/:id");
  const id = params?.id;
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const { data: contrato, isLoading, isError, refetch } = useGetContrato(activeLojaId!, id!, {
    query: { queryKey: getGetContratoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });
  const leads = useListLeads(activeLojaId!, { query: { queryKey: getListLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const cancelar = useCancelarContrato();

  const noivaNome = useMemo(
    () => leads.data?.find((l) => l.id === contrato?.leadId)?.noivaNome,
    [leads.data, contrato?.leadId],
  );

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar o contrato</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          <span>Falha ao buscar o contrato.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;
  if (!contrato) return <div>Contrato não encontrado.</div>;

  const onCancelar = async () => {
    if (!motivo.trim()) {
      toast({ title: "Informe o motivo do cancelamento", variant: "destructive" });
      return;
    }
    try {
      await cancelar.mutateAsync({ lojaId: activeLojaId!, contratoId: id!, data: { motivo: motivo.trim() } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetContratoQueryKey(activeLojaId!, id!) }),
        queryClient.invalidateQueries({ queryKey: getListContratosQueryKey(activeLojaId!) }),
      ]);
      toast({ title: "Contrato cancelado", description: "Parcelas previstas canceladas e vestido liberado." });
      setCancelarOpen(false);
    } catch (err) {
      toast({
        title: "Erro ao cancelar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif">{noivaNome ?? `Contrato #${contrato.id.slice(0, 6)}`}</h1>
          <p className="text-sm text-muted-foreground">
            Fechado em {new Date(contrato.fechadoEm).toLocaleDateString("pt-BR")}
            {contrato.dataCasamento && ` • Casamento ${new Date(contrato.dataCasamento).toLocaleDateString("pt-BR")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={contrato.status === 'ATIVO' ? 'default' : 'destructive'} className="text-sm px-3 py-1">
            {contrato.status}
          </Badge>
          {contrato.status === "ATIVO" && (
            <Button variant="outline" size="sm" onClick={() => setCancelarOpen(true)}>
              Cancelar contrato
            </Button>
          )}
        </div>
      </div>

      {contrato.status === "CANCELADO" && contrato.canceladoMotivo && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Contrato cancelado{contrato.canceladoEm && ` em ${new Date(contrato.canceladoEm).toLocaleDateString("pt-BR")}`}</AlertTitle>
          <AlertDescription>Motivo: {contrato.canceladoMotivo}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes Financeiros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-muted-foreground text-sm">Valor Total</span>
              <p className="text-2xl font-semibold text-primary">R$ {brl(contrato.valorTotal)}</p>
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
            {contrato.itens && contrato.itens.length > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">Itens contratados</span>
                <ul className="mt-1 space-y-1">
                  {contrato.itens.map((item) => (
                    <li key={item.id} className="flex justify-between text-sm">
                      <span>{item.quantidade}× {item.descricao}</span>
                      <span className="font-medium">R$ {brl(item.quantidade * item.valorUnitario)}</span>
                    </li>
                  ))}
                </ul>
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
                {contrato.parcelas.map((parcela) => (
                  <li key={parcela.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{parcela.numero === 0 ? "Entrada" : `Parcela ${parcela.numero}`}</p>
                      <p className="text-xs text-muted-foreground">Venc: {new Date(parcela.vencimento).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">R$ {brl(parcela.valorPrevisto)}</p>
                      <Badge
                        variant={parcela.status === "PAGA" ? "default" : parcela.status === "CANCELADA" ? "outline" : "secondary"}
                        className="text-[10px]"
                      >
                        {PARCELA_STATUS[parcela.status] ?? parcela.status}
                      </Badge>
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

      <Dialog open={cancelarOpen} onOpenChange={setCancelarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              As parcelas previstas serão canceladas e o vestido será liberado. Parcelas já pagas não são alteradas.
            </p>
            <Textarea
              placeholder="Motivo do cancelamento *"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarOpen(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={onCancelar} disabled={cancelar.isPending}>
              {cancelar.isPending ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
