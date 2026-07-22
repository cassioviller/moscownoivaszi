import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useCreateAtendimento,
  useDeleteAtendimento,
  useListCabines,
  getListCabinesQueryKey,
  useListEquipe,
  getListEquipeQueryKey,
  useListBloqueios,
  getListBloqueiosQueryKey,
  useGetDisponibilidade,
  getGetDisponibilidadeQueryKey,
  type Atendimento,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ComboboxNoiva } from "@/components/combobox-noiva";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { MessageCircle } from "lucide-react";
import { dataCurtaFmt } from "../noivas/helpers";
import { podeNoModulo } from "@/lib/permissoes";
import { linkWhatsApp, msgConfirmacaoAtendimento } from "@/lib/whatsapp";
import {
  slotsOferecidos,
  instanteDoSlot,
  DETALHE_RECUSA,
  EXPEDIENTE_PADRAO,
  type Expediente,
  type Marcacao,
} from "@workspace/agenda-core";
import { cn } from "@/lib/utils";

const agendarSchema = z
  .object({
    tipo: z.enum(["ATENDIMENTO", "PROVA"]),
    leadId: z.string().min(1, "Escolha a noiva"),
    bloqueioId: z.string().optional(),
    cabineId: z.string().min(1, "Escolha a cabine"),
    vendedoraId: z.string().min(1, "Escolha a vendedora"),
    data: z.string().min(1, "Informe a data"),
    hora: z.string().min(1, "Informe a hora"),
    observacao: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.tipo === "PROVA" && !values.bloqueioId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bloqueioId"],
        message: "Escolha o vestido reservado para a prova.",
      });
    }
  });

type AgendarValues = z.infer<typeof agendarSchema>;

const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Agendar atendimento/prova (porte da /atendimentos/novo do feat/orcamentos).
 * Marca o horário na grade; o ato de atender fica na fila (/atendimentos).
 */
export default function NovoAtendimento() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [cancelando, setCancelando] = useState<Atendimento | null>(null);

  // Deep-link do detalhe da reserva ("Agendar prova"): ?noiva=&tipo=PROVA&reserva=
  // pré-preenche o formulário. `tipo` só aceita os valores do schema.
  const tipoParam = searchParams.get("tipo");
  const prefill = {
    tipo: tipoParam === "PROVA" || tipoParam === "ATENDIMENTO" ? tipoParam : "ATENDIMENTO",
    leadId: searchParams.get("noiva") ?? "",
    bloqueioId: searchParams.get("reserva") ?? "",
  } as const;

  const equipe = useListEquipe(activeLojaId!, {
    query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const cabines = useListCabines(activeLojaId!, {
    query: { queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const bloqueios = useListBloqueios(activeLojaId!, undefined, {
    query: { queryKey: getListBloqueiosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const atendimentos = useListAtendimentos(activeLojaId!, {
    query: { queryKey: getListAtendimentosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const disponibilidade = useGetDisponibilidade(activeLojaId!, {
    query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const createAtendimento = useCreateAtendimento();
  const deleteAtendimento = useDeleteAtendimento();

  // Agendar é do módulo `agenda` no backend, não `leads`; e a config de
  // cabines é gateada por `agenda` também — era `config`, que o servidor não
  // conhece e por isso negava para todo mundo.
  const podeCriar = podeNoModulo(acessosModulos, "agenda", "criar");
  const podeVerConfig = podeNoModulo(acessosModulos, "agenda", "ver");

  const form = useForm<AgendarValues>({
    resolver: zodResolver(agendarSchema),
    defaultValues: {
      tipo: prefill.tipo,
      leadId: prefill.leadId,
      bloqueioId: prefill.bloqueioId,
      cabineId: "",
      vendedoraId: "",
      data: "",
      hora: "",
      observacao: "",
    },
  });
  const tipo = form.watch("tipo");
  const leadId = form.watch("leadId");
  const cabineId = form.watch("cabineId");
  const vendedoraId = form.watch("vendedoraId");
  const dataEscolhida = form.watch("data");
  const horaEscolhida = form.watch("hora");

  const cabinesAtivas = useMemo(
    () => (cabines.data ?? []).filter((c) => c.ativo),
    [cabines.data],
  );

  // Reservas de casamento da noiva (picker quando Tipo=Prova) — o bloqueio já
  // vem com o vestido aninhado (codigo/nome) do GET /bloqueios.
  const reservasDaNoiva = useMemo(
    () =>
      (bloqueios.data ?? []).filter(
        (b) => b.leadId === leadId && b.tipo === "RESERVA_CASAMENTO" && !b.canceladoEm,
      ),
    [bloqueios.data, leadId],
  );

  const proximos = useMemo(() => {
    const agora = Date.now();
    return (atendimentos.data ?? [])
      .filter((a) => a.situacao === "AGENDADO" && new Date(a.inicio).getTime() >= agora)
      .sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime())
      .slice(0, 10);
  }, [atendimentos.data]);

  const regra = disponibilidade.data;

  // E64: a agenda OFERECE — a mesma régua do arraste da grade (agenda-core)
  // percorre a malha do dia e diz o que está livre, ANTES do submit. O input
  // de hora livre deixava o conflito estourar como erro da API depois.
  const expediente = useMemo<Expediente>(
    () =>
      regra
        ? {
            aberturaHora: regra.atendimentoAberturaHora,
            fechamentoHora: regra.atendimentoFechamentoHora,
            dias: regra.diasFuncionamento ?? undefined,
            provaDuracao: regra.provaDuracao,
          }
        : EXPEDIENTE_PADRAO,
    [regra],
  );
  const slotsDoDiaEscolhido = useMemo(() => {
    if (!dataEscolhida || !cabineId || !vendedoraId) return null;
    // Concluído e falta não seguram a cabine — só o que ainda vai acontecer.
    const ocupadas: Marcacao[] = (atendimentos.data ?? []).filter(
      (a) => a.situacao === "AGENDADO" || a.situacao === "EM_ATENDIMENTO",
    );
    return slotsOferecidos(dataEscolhida, { cabineId, vendedoraId, tipo }, ocupadas, expediente);
  }, [dataEscolhida, cabineId, vendedoraId, tipo, atendimentos.data, expediente]);
  const lojaFechadaNoDia =
    slotsDoDiaEscolhido !== null &&
    slotsDoDiaEscolhido.length > 0 &&
    slotsDoDiaEscolhido.every((s) => s.recusa === "LOJA_FECHADA");

  // E8: confirmação por wa.me com nome/endereço da loja vindos da sessão.
  const lojaAtiva = session?.lojas?.find((l) => l.id === activeLojaId);
  const waConfirmacao = (a: {
    lead?: { noivaNome?: string; whatsapp?: string | null } | null;
    tipo: string;
    inicio: string;
  }) =>
    linkWhatsApp(
      a.lead?.whatsapp,
      msgConfirmacaoAtendimento({
        noivaNome: a.lead?.noivaNome,
        tipo: a.tipo,
        inicio: a.inicio,
        lojaNome: lojaAtiva?.nome,
        endereco: lojaAtiva?.endereco,
      }),
    );

  const onSubmit = async (values: AgendarValues) => {
    try {
      const criado = await createAtendimento.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          leadId: values.leadId,
          cabineId: values.cabineId,
          vendedoraId: values.vendedoraId,
          tipo: values.tipo,
          bloqueioId: values.tipo === "PROVA" ? values.bloqueioId || undefined : undefined,
          // O instante nasce no fuso da LOJA (agenda-core), não no do navegador.
          inicio: instanteDoSlot(values.data, values.hora).toISOString(),
          observacao: values.observacao || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) });
      const wa = waConfirmacao(criado);
      toast({
        title: "Atendimento agendado",
        ...(wa
          ? {
              description: "Quer já mandar a confirmação para a noiva?",
              action: (
                <ToastAction altText="Enviar confirmação por WhatsApp" asChild>
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </ToastAction>
              ),
            }
          : {}),
      });
      form.reset();
    } catch (err) {
      toast({
        title: "Erro ao agendar",
        description:
          err instanceof Error ? err.message : "Verifique conflito de horário e tente novamente.",
        variant: "destructive",
      });
    }
  };

  const onCancelar = async () => {
    if (!cancelando) return;
    try {
      await deleteAtendimento.mutateAsync({ lojaId: activeLojaId!, atendimentoId: cancelando.id });
      await queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) });
      toast({ title: "Atendimento cancelado" });
    } catch (err) {
      toast({
        title: "Erro ao cancelar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCancelando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to={`/loja/${lojaId}/atendimentos`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Atendimentos
          </Link>
          <h1 className="text-3xl font-serif mt-1">Agendar</h1>
        </div>
        {podeVerConfig && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/loja/${lojaId}/atendimentos/config`}>Cabines &amp; horário</Link>
          </Button>
        )}
      </div>

      {!podeCriar ? (
        <p className="text-sm text-muted-foreground">Você não tem permissão para agendar.</p>
      ) : !cabines.isLoading && cabinesAtivas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cadastre ao menos uma cabine em{" "}
          <Link to={`/loja/${lojaId}/atendimentos/config`} className="underline underline-offset-4">
            Cabines &amp; horário
          </Link>{" "}
          para agendar.
        </p>
      ) : (
        <Card className="max-w-2xl">
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <div className="flex gap-2">
                        {(["ATENDIMENTO", "PROVA"] as const).map((t) => (
                          <Button
                            key={t}
                            type="button"
                            size="sm"
                            variant={field.value === t ? "default" : "outline"}
                            aria-pressed={field.value === t}
                            onClick={() => {
                              field.onChange(t);
                              if (t === "ATENDIMENTO") form.setValue("bloqueioId", "");
                            }}
                          >
                            {t === "ATENDIMENTO" ? "Atendimento" : "Prova"}
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="leadId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Noiva *</FormLabel>
                      <FormControl>
                        <ComboboxNoiva
                          lojaId={activeLojaId!}
                          value={field.value || null}
                          onChange={(v) => {
                            field.onChange(v);
                            form.setValue("bloqueioId", "");
                          }}
                          placeholder="Selecione a noiva…"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {tipo === "PROVA" && (
                  <FormField
                    control={form.control}
                    name="bloqueioId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reserva / vestido *</FormLabel>
                        {!leadId ? (
                          <p className="text-sm text-muted-foreground">
                            Escolha a noiva para listar as reservas.
                          </p>
                        ) : bloqueios.isLoading ? (
                          <p className="text-sm text-muted-foreground">Carregando reservas…</p>
                        ) : reservasDaNoiva.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Esta noiva não tem reserva de casamento. Crie a reserva antes de
                            agendar a prova.
                          </p>
                        ) : (
                          <Select value={field.value ?? ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger aria-label="Reserva">
                                <SelectValue placeholder="Selecione o vestido reservado…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {reservasDaNoiva.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  Vestido {r.vestido?.codigo ?? "?"} · {r.vestido?.nome ?? "sem nome"}
                                  {r.casamentoData
                                    ? ` — casamento ${dataCurtaFmt.format(new Date(r.casamentoData))}`
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cabineId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cabine *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger aria-label="Cabine">
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cabinesAtivas.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vendedoraId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedora *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger aria-label="Vendedora">
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(equipe.data ?? [])
                              .filter((m) => m.ativo !== false)
                              .map((m) => (
                                <SelectItem key={m.usuarioId} value={m.usuarioId}>
                                  {m.nome}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="data"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data *</FormLabel>
                        <FormControl>
                          <Input type="date" aria-label="Data" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* E64: a grade de horários — livre se clica, ocupado explica. */}
                <FormField
                  control={form.control}
                  name="hora"
                  render={() => (
                    <FormItem>
                      <FormLabel>Hora *</FormLabel>
                      {!slotsDoDiaEscolhido ? (
                        <p className="text-sm text-muted-foreground">
                          Escolha cabine, vendedora e data para ver os horários livres.
                        </p>
                      ) : lojaFechadaNoDia ? (
                        <p className="text-sm text-muted-foreground">
                          A loja não abre nesse dia da semana.
                        </p>
                      ) : (
                        <div
                          className="grid grid-cols-4 sm:grid-cols-6 gap-2"
                          data-testid="grade-slots"
                        >
                          {slotsDoDiaEscolhido.map(({ slot, recusa }) => (
                            <Button
                              key={slot}
                              type="button"
                              size="sm"
                              variant={horaEscolhida === slot ? "default" : "outline"}
                              disabled={recusa !== null}
                              title={recusa ? DETALHE_RECUSA[recusa] : undefined}
                              aria-label={`Horário ${slot}${recusa ? ` — ${DETALHE_RECUSA[recusa]}` : ""}`}
                              className={cn("tabular-nums", recusa && "opacity-40")}
                              onClick={() =>
                                form.setValue("hora", slot, { shouldValidate: true })
                              }
                              data-testid={`slot-${slot}`}
                            >
                              {slot}
                            </Button>
                          ))}
                        </div>
                      )}
                      {regra && !lojaFechadaNoDia && (
                        <p className="text-xs text-muted-foreground">
                          Funcionamento: {regra.atendimentoAberturaHora}h às{" "}
                          {regra.atendimentoFechamentoHora}h.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="observacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observação (opcional)</FormLabel>
                      <FormControl>
                        <Input aria-label="Observação" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={createAtendimento.isPending}>
                  {createAtendimento.isPending ? "Agendando…" : "Agendar"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Próximos atendimentos</CardTitle>
        </CardHeader>
        <CardContent>
          {proximos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum atendimento agendado.</p>
          ) : (
            <ul className="divide-y">
              {proximos.map((a) => {
                const wa = waConfirmacao(a);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {a.lead?.noivaNome ?? "Noiva"}
                        {a.tipo === "PROVA" ? " — Prova" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dataHoraFmt.format(new Date(a.inicio))} · {a.cabine?.nome ?? "Cabine"} ·{" "}
                        {a.vendedora?.nome ?? "Vendedora"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {wa && (
                        <Button asChild variant="outline" size="sm">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1 h-4 w-4" />
                            Confirmar
                          </a>
                        </Button>
                      )}
                      {podeCriar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Cancelar atendimento"
                          disabled={deleteAtendimento.isPending}
                          onClick={() => setCancelando(a)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!cancelando} onOpenChange={(aberto) => !aberto && setCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar atendimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelar o atendimento de {cancelando?.lead?.noivaNome ?? "noiva"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={onCancelar} disabled={deleteAtendimento.isPending}>
              {deleteAtendimento.isPending ? "Cancelando…" : "Cancelar atendimento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
