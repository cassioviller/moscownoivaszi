import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAjustes,
  getListAjustesQueryKey,
  getListAtendimentosQueryKey,
  useUpdateAjuste,
  useUpdateChecklistItem,
  type Ajuste,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { dataCurtaFmt, diasAteCasamento } from "../noivas/helpers";
import { podeNoModulo } from "@/lib/permissoes";
import { mensagemApi } from "@/lib/erro-api";

/**
 * Ajustes — a fila da costureira (E14). O prazo que manda é a PRÓXIMA PROVA:
 * é para ela que a peça precisa estar pronta; o casamento é o fallback de quem
 * não tem prova marcada. O checklist por peça é interativo aqui mesmo — marcar
 * "barra feita" não pode exigir abrir a reserva. Recorte "esta semana" para a
 * pergunta de segunda de manhã: o que eu costuro até sexta?
 */

/** Prazo efetivo em dias: próxima prova, senão casamento; null = sem prazo. */
function prazoDias(a: Ajuste): number | null {
  const referencia = a.proximaProva ?? a.atendimento?.bloqueio?.casamentoData;
  return referencia ? diasAteCasamento(referencia) : null;
}

function rotuloProva(dias: number): string {
  if (dias < 0) return "prova atrasada";
  if (dias === 0) return "prova hoje";
  if (dias === 1) return "prova amanhã";
  return `prova em ${dias} dias`;
}

function rotuloCasamento(dias: number): string {
  if (dias < 0) return "casamento passou";
  if (dias === 0) return "casamento hoje";
  if (dias === 1) return "casamento amanhã";
  return `casamento em ${dias} dias`;
}

export default function Ajustes() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Semana é o recorte padrão — a fila responde "o que costuro agora", não
  // "tudo que existe". `?recorte=todos` abre o horizonte inteiro.
  const recorte = searchParams.get("recorte") === "todos" ? "todos" : "semana";

  const { data: ajustes, isLoading, isError, error, refetch } = useListAjustes(activeLojaId!, {
    query: {
      queryKey: getListAjustesQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });
  const updateAjuste = useUpdateAjuste();
  const updateChecklist = useUpdateChecklistItem();
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");

  const { pendentes, foraDaSemana } = useMemo(() => {
    const lista = (ajustes ?? []).filter((a): a is Ajuste => a.status === "PENDENTE");
    // Prazo mais apertado primeiro; sem prazo ao fim (não some — vira rabeira).
    lista.sort((a, b) => {
      const da = prazoDias(a);
      const db = prazoDias(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
    if (recorte === "todos") return { pendentes: lista, foraDaSemana: 0 };
    const semana = lista.filter((a) => {
      const dias = prazoDias(a);
      return dias !== null && dias <= 7;
    });
    return { pendentes: semana, foraDaSemana: lista.length - semana.length };
  }, [ajustes, recorte]);

  const invalidar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAjustesQueryKey(activeLojaId!) }),
      // Ajustes também aninham dentro dos atendimentos → invalida as duas listas.
      queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    ]);

  const marcarFeito = async (ajusteId: string) => {
    try {
      await updateAjuste.mutateAsync({
        lojaId: activeLojaId!,
        ajusteId,
        data: { status: "FEITO" },
      });
      await invalidar();
      toast({ title: "Ajuste concluído" });
    } catch (err) {
      toast({
        title: "Erro ao concluir o ajuste",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const marcarPeca = async (itemId: string, feito: boolean) => {
    try {
      await updateChecklist.mutateAsync({
        lojaId: activeLojaId!,
        itemId,
        data: { feito },
      });
      await invalidar();
    } catch (err) {
      toast({
        title: "Erro ao marcar a peça",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const trocarRecorte = (novo: "semana" | "todos") => {
    const proximo = new URLSearchParams(searchParams);
    if (novo === "todos") proximo.set("recorte", "todos");
    else proximo.delete("recorte");
    setSearchParams(proximo, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif">Ajustes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A fila da costureira, do prazo mais apertado ao mais folgado — a próxima prova é o
            prazo; sem prova marcada, vale o casamento.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          <Button
            variant={recorte === "semana" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => trocarRecorte("semana")}
          >
            Esta semana
          </Button>
          <Button
            variant={recorte === "todos" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => trocarRecorte("todos")}
          >
            Todos
          </Button>
        </div>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar os ajustes</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{mensagemApi(error, "Falha inesperada ao buscar os ajustes.")}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <Card className="animate-pulse h-40" />
      ) : pendentes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {recorte === "semana" && foraDaSemana > 0 ? (
            <>
              <p>Nada com prazo nesta semana.</p>
              <p className="text-sm mt-1">
                {foraDaSemana} ajuste{foraDaSemana === 1 ? "" : "s"} pendente
                {foraDaSemana === 1 ? "" : "s"} mais adiante —{" "}
                <button className="underline" onClick={() => trocarRecorte("todos")}>
                  ver todos
                </button>
                .
              </p>
            </>
          ) : (
            <>
              <p>Nenhum ajuste pendente.</p>
              <p className="text-sm mt-1">
                Quando uma prova gerar um ajuste de costura, ele aparece aqui — com a noiva, o
                vestido e o prazo — até ser concluído.
              </p>
            </>
          )}
        </div>
      ) : (
        <Card>
          <ul className="divide-y">
            {pendentes.map((a) => {
              const bloqueio = a.atendimento?.bloqueio;
              const casamento = bloqueio?.casamentoData;
              const diasProva = a.proximaProva ? diasAteCasamento(a.proximaProva) : null;
              const diasCasamento = casamento ? diasAteCasamento(casamento) : null;
              // Urgência: prova a ≤7 dias (ou atrasada); sem prova, casamento a ≤14.
              const urgente =
                diasProva !== null ? diasProva <= 7 : diasCasamento !== null && diasCasamento <= 14;
              const checklist = a.checklist ?? [];
              const feitos = checklist.filter((c) => c.feito).length;
              return (
                <li key={a.id} className="flex items-start gap-4 px-4 py-3">
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
                      {diasProva !== null ? (
                        <>
                          <span>·</span>
                          <span className={urgente ? "text-destructive font-medium" : undefined}>
                            {rotuloProva(diasProva)}
                          </span>
                          <span>·</span>
                          <span>{dataCurtaFmt.format(new Date(a.proximaProva!))}</span>
                        </>
                      ) : diasCasamento !== null ? (
                        <>
                          <span>·</span>
                          <span className={urgente ? "text-destructive font-medium" : undefined}>
                            {rotuloCasamento(diasCasamento)}
                          </span>
                          <span>·</span>
                          <span>{dataCurtaFmt.format(new Date(casamento!))}</span>
                        </>
                      ) : (
                        <>
                          <span>·</span>
                          <span>sem prazo definido</span>
                        </>
                      )}
                    </span>
                    {/* Checklist por peça, interativo na própria fila (E14). */}
                    {checklist.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {checklist.map((item) => (
                          <li key={item.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              id={`peca-${item.id}`}
                              checked={item.feito}
                              disabled={!podeEditar || updateChecklist.isPending}
                              onCheckedChange={(v) => marcarPeca(item.id, v === true)}
                              aria-label={item.descricao}
                            />
                            <label
                              htmlFor={`peca-${item.id}`}
                              className={
                                item.feito ? "text-muted-foreground line-through" : undefined
                              }
                            >
                              {item.descricao}
                            </label>
                          </li>
                        ))}
                        <li className="text-xs text-muted-foreground">
                          {feitos}/{checklist.length} peça{checklist.length === 1 ? "" : "s"}
                        </li>
                      </ul>
                    )}
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
