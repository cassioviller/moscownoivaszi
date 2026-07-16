import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAjustes,
  getListAjustesQueryKey,
  getListAtendimentosQueryKey,
  useUpdateAjuste,
  type Ajuste,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  dataCurtaFmt,
  diasAteCasamento,
  casamentoUrgente,
  moduloLiberado,
} from "../noivas/helpers";
import { prazoCasamento } from "../reservas/helpers";

/**
 * Ajustes — a fila da costureira (porte da /ajustes do feat/orcamentos): os
 * ajustes PENDENTES da loja, do casamento mais próximo ao mais distante
 * (urgência primeiro; sem data ao fim). Cada item traz noiva, vestido e prazo,
 * com um toque para marcar feito. O destaque fica reservado à urgência
 * (casamento ≤14d), não a toda linha.
 */
export default function Ajustes() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ajustes, isLoading, isError, error, refetch } = useListAjustes(activeLojaId!, {
    query: {
      queryKey: getListAjustesQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });
  const updateAjuste = useUpdateAjuste();

  // TODO Onda 4: distinguir ver/editar — hoje o gate é flat por módulo
  // (backend gateia ajustes no módulo "agenda"; o orcamentos usava ajustes:editar).
  const podeEditar = !acessosModulos || moduloLiberado(acessosModulos["agenda"]);

  const pendentes = useMemo(() => {
    const lista = (ajustes ?? []).filter((a): a is Ajuste => a.status === "PENDENTE");
    // Casamento mais próximo primeiro; ajustes sem data de casamento ao fim.
    lista.sort((a, b) => {
      const da = a.atendimento?.bloqueio?.casamentoData;
      const db = b.atendimento?.bloqueio?.casamentoData;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da).getTime() - new Date(db).getTime();
    });
    return lista;
  }, [ajustes]);

  const marcarFeito = async (ajusteId: string) => {
    try {
      await updateAjuste.mutateAsync({
        lojaId: activeLojaId!,
        ajusteId,
        data: { status: "FEITO" },
      });
      // Ajustes também aninham dentro dos atendimentos → invalida as duas listas.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAjustesQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
      ]);
      toast({ title: "Ajuste concluído" });
    } catch (err) {
      toast({
        title: "Erro ao concluir o ajuste",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Ajustes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Os ajustes de costura que pedem atenção, do casamento mais próximo ao mais distante.
        </p>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar os ajustes</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error instanceof Error ? error.message : "Falha inesperada."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <Card className="animate-pulse h-40" />
      ) : pendentes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum ajuste pendente.</p>
          <p className="text-sm mt-1">
            Quando uma prova gerar um ajuste de costura, ele aparece aqui — com a noiva, o vestido e
            o prazo — até ser concluído.
          </p>
        </div>
      ) : (
        <Card>
          <ul className="divide-y">
            {pendentes.map((a) => {
              const bloqueio = a.atendimento?.bloqueio;
              const casamento = bloqueio?.casamentoData;
              const dias = casamento ? diasAteCasamento(casamento) : null;
              const urgente = dias !== null && casamentoUrgente(dias);
              const feitos = (a.checklist ?? []).filter((c) => c.feito).length;
              const total = (a.checklist ?? []).length;
              return (
                <li key={a.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm">{a.descricao}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {a.atendimento?.leadId ? (
                        <Link
                          to={`/loja/${lojaId}/noivas/${a.atendimento.leadId}`}
                          className="hover:underline"
                        >
                          {a.atendimento.lead?.noivaNome ?? "Noiva"}
                        </Link>
                      ) : (
                        <span>{a.atendimento?.lead?.noivaNome ?? "Noiva"}</span>
                      )}
                      {bloqueio?.vestido && (
                        <>
                          <span>·</span>
                          <span>
                            {bloqueio.vestido.codigo} · {bloqueio.vestido.nome}
                          </span>
                        </>
                      )}
                      {casamento && dias !== null && (
                        <>
                          <span>·</span>
                          {/* urgência primeiro (destaque só ≤14d), data exata como referência */}
                          <span className={urgente ? "text-destructive font-medium" : undefined}>
                            {prazoCasamento(dias)}
                          </span>
                          <span>·</span>
                          <span>{dataCurtaFmt.format(new Date(casamento))}</span>
                        </>
                      )}
                      {total > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            checklist {feitos}/{total}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.atendimento?.bloqueioId && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/loja/${lojaId}/reservas/${a.atendimento.bloqueioId}`}>
                          Abrir
                        </Link>
                      </Button>
                    )}
                    {podeEditar && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={updateAjuste.isPending}
                        onClick={() => marcarFeito(a.id)}
                      >
                        Marcar feito
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
