import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListCabines,
  getListCabinesQueryKey,
  useCreateCabine,
  useUpdateCabine,
  useGetDisponibilidade,
  getGetDisponibilidadeQueryKey,
  useSetDisponibilidade,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { CACHE_ESTAVEL } from "@/lib/cache";

/**
 * Cabines & horário de atendimento (porte da /atendimentos/config do
 * feat/orcamentos). O horário vive na regra de disponibilidade da loja
 * (atendimentoAberturaHora/FechamentoHora); salvar preserva os demais campos.
 */

// Índice = dia da semana (0=domingo … 6=sábado), como no diasFuncionamento (E38).
const DIAS_ROTULO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ConfigAtendimentos() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cabines = useListCabines(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const disponibilidade = useGetDisponibilidade(activeLojaId!, {
    query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const createCabine = useCreateCabine();
  const updateCabine = useUpdateCabine();
  const setDisponibilidade = useSetDisponibilidade();

  // Cabines e disponibilidade são gateadas por `agenda` no backend — era
  // `config`, um módulo que o servidor não conhece: negava para todo mundo.
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");

  const [nomeCabine, setNomeCabine] = useState("");

  const regra = disponibilidade.data;

  /**
   * D13 (E93): isto era um `useEffect` que copiava a regra do servidor para
   * três `useState`, com `[regra]` na dependência — e `regra` é
   * `disponibilidade.data`, cuja REFERÊNCIA muda a cada refetch bem-sucedido.
   * A sequência real: a pessoa digita a nova hora de fechamento ("20"),
   * alt-tab para conferir a escala no WhatsApp, volta, o refetch por foco de
   * janela dispara, o effect roda e devolve o "19" do servidor ao campo. A
   * digitação sumia sem uma palavra, e ela salvava o horário antigo achando
   * que salvou o novo.
   *
   * `values` + `keepDirtyValues` é o mesmo "copiar do servidor" feito por quem
   * sabe a diferença entre um campo intocado e um campo sujo: o intocado
   * acompanha o servidor, o sujo é da pessoa até ela salvar ou sair.
   * Era a última tela do app com o padrão do effect — as outras 11 já usavam
   * `react-hook-form`.
   */
  const form = useForm<{ abertura: string; fechamento: string; dias: number[] }>({
    defaultValues: { abertura: "", fechamento: "", dias: [] },
    values: regra
      ? {
          abertura: String(regra.atendimentoAberturaHora),
          fechamento: String(regra.atendimentoFechamentoHora),
          // Dias em que a loja abre (E38): 0=domingo … 6=sábado.
          dias: regra.diasFuncionamento ?? [1, 2, 3, 4, 5, 6],
        }
      : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const salvarHorario = async () => {
    const { abertura, fechamento, dias } = form.getValues();
    const a = Number(abertura);
    const f = Number(fechamento);
    if (!Number.isInteger(a) || !Number.isInteger(f) || a < 0 || f > 24 || a >= f) {
      toast({
        title: "Horário inválido",
        description: "A abertura deve ser antes do fechamento (0h a 24h).",
        variant: "destructive",
      });
      return;
    }
    if (dias.length === 0) {
      toast({
        title: "Escolha ao menos um dia",
        description: "Sem nenhum dia aberto, a agenda fica fechada a semana inteira.",
        variant: "destructive",
      });
      return;
    }
    try {
      // Preserva os demais campos da regra de disponibilidade.
      await setDisponibilidade.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          provaDiasAntes: regra?.provaDiasAntes,
          provaDuracao: regra?.provaDuracao,
          usoDiasAntes: regra?.usoDiasAntes,
          usoDiasDepois: regra?.usoDiasDepois,
          lavagemDiasDepois: regra?.lavagemDiasDepois,
          atendimentoAberturaHora: a,
          atendimentoFechamentoHora: f,
          diasFuncionamento: [...dias].sort((x, y) => x - y),
        },
      });
      // Salvou: o que estava sujo virou o valor do servidor. Sem este reset o
      // `keepDirtyValues` continuaria protegendo campos que já não divergem.
      form.reset({ abertura, fechamento, dias });
      await queryClient.invalidateQueries({
        queryKey: getGetDisponibilidadeQueryKey(activeLojaId!),
      });
      toast({ title: "Horário salvo" });
    } catch (err) {
      toast({
        title: "Erro ao salvar horário",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const alternarCabine = async (cabineId: string, ativo: boolean) => {
    try {
      await updateCabine.mutateAsync({ lojaId: activeLojaId!, cabineId, data: { ativo } });
      await queryClient.invalidateQueries({ queryKey: getListCabinesQueryKey(activeLojaId!) });
      toast({ title: "Cabines atualizadas" });
    } catch (err) {
      toast({
        title: "Erro ao atualizar cabine",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const adicionarCabine = async () => {
    const nome = nomeCabine.trim();
    if (!nome) return;
    try {
      await createCabine.mutateAsync({ lojaId: activeLojaId!, data: { nome } });
      await queryClient.invalidateQueries({ queryKey: getListCabinesQueryKey(activeLojaId!) });
      toast({ title: "Cabine adicionada" });
      setNomeCabine("");
    } catch (err) {
      toast({
        title: "Erro ao adicionar cabine",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/loja/${lojaId}/atendimentos/novo`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Agendar
        </Link>
        <h1 className="text-3xl font-serif mt-1">Cabines &amp; horário</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Horário de funcionamento</CardTitle>
        </CardHeader>
        <CardContent>
          {podeEditar ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="abertura">Abre (h)</Label>
                  <Input
                    id="abertura"
                    type="number"
                    min={0}
                    max={23}
                    className="w-24"
                    {...form.register("abertura")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fechamento">Fecha (h)</Label>
                  <Input
                    id="fechamento"
                    type="number"
                    min={1}
                    max={24}
                    className="w-24"
                    {...form.register("fechamento")}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Dias de funcionamento</Label>
                <Controller
                  control={form.control}
                  name="dias"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-1.5">
                      {DIAS_ROTULO.map((rot, n) => {
                        const aberto = field.value.includes(n);
                        return (
                          <Button
                            key={n}
                            type="button"
                            size="sm"
                            variant={aberto ? "default" : "outline"}
                            aria-pressed={aberto}
                            data-testid={`dia-func-${n}`}
                            onClick={() =>
                              field.onChange(
                                aberto
                                  ? field.value.filter((d) => d !== n)
                                  : [...field.value, n],
                              )
                            }
                          >
                            {rot}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>
              <Button
                variant="outline"
                onClick={salvarHorario}
                disabled={setDisponibilidade.isPending || disponibilidade.isLoading}
              >
                {setDisponibilidade.isPending ? "Salvando…" : "Salvar expediente"}
              </Button>
            </div>
          ) : (
            <p className="text-sm">
              {regra
                ? `${regra.atendimentoAberturaHora}h às ${regra.atendimentoFechamentoHora}h · ${
                    regra.diasFuncionamento?.map((d) => DIAS_ROTULO[d]).join(", ") ?? "—"
                  }`
                : "Carregando…"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Cabines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cabines.isLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 bg-muted rounded-md" />
              ))}
            </div>
          ) : (cabines.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cabine cadastrada.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {cabines.data?.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span
                    className={`text-sm ${c.ativo ? "" : "text-muted-foreground line-through"}`}
                  >
                    {c.nome}
                  </span>
                  {podeEditar && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {c.ativo ? "Ativa" : "Inativa"}
                      </span>
                      <Switch
                        checked={c.ativo}
                        disabled={updateCabine.isPending}
                        onCheckedChange={(ativo) => alternarCabine(c.id, ativo)}
                        aria-label={`${c.ativo ? "Desativar" : "Ativar"} ${c.nome}`}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {podeEditar && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                adicionarCabine();
              }}
            >
              <Input
                value={nomeCabine}
                onChange={(e) => setNomeCabine(e.target.value)}
                placeholder="Nova cabine (ex.: Cabine 1)"
                aria-label="Nome da cabine"
                className="flex-1"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={createCabine.isPending || !nomeCabine.trim()}
              >
                {createCabine.isPending ? "Adicionando…" : "Adicionar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
