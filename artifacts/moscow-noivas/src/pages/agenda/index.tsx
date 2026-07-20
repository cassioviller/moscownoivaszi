import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { podeNoModulo } from "@/lib/permissoes";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useCreateAtendimento,
  useListCabines,
  getListCabinesQueryKey,
  useListLeads,
  getListLeadsQueryKey,
  useListAjustes,
  getListAjustesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, isSameDay } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Clock, Plus, AlertCircle, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { linkWhatsApp, msgConfirmacaoAtendimento } from "@/lib/whatsapp";

const novoAtendimentoSchema = z.object({
  leadId: z.string().min(1, "Escolha a noiva"),
  cabineId: z.string().min(1, "Escolha a cabine"),
  tipo: z.enum(["ATENDIMENTO", "PROVA"]),
  inicio: z.string().min(1, "Informe data e hora"),
  observacao: z.string().optional(),
});

type NovoAtendimentoValues = z.infer<typeof novoAtendimentoSchema>;

const SITUACAO_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

export default function Agenda() {
  const { activeLojaId, user, acessosModulos, session } = useAuth();
  const podeCriar = podeNoModulo(acessosModulos, "agenda", "criar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const atendimentos = useListAtendimentos(activeLojaId!, { query: { queryKey: getListAtendimentosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const cabines = useListCabines(activeLojaId!, { query: { queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const leads = useListLeads(activeLojaId!, { query: { queryKey: getListLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const ajustes = useListAjustes(activeLojaId!, { query: { queryKey: getListAjustesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const createAtendimento = useCreateAtendimento();

  const nomePorLead = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const lead of leads.data ?? []) mapa.set(lead.id, lead.noivaNome);
    return mapa;
  }, [leads.data]);

  // E8: confirmação por wa.me — a mensagem carrega nome e endereço da loja,
  // que já vêm na sessão (/auth/me); nada de request extra.
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

  // Somente os atendimentos de HOJE, ordenados por horário.
  const doDia = useMemo(() => {
    const hoje = new Date();
    return (atendimentos.data ?? [])
      .filter((a) => isSameDay(new Date(a.inicio), hoje))
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  }, [atendimentos.data]);

  const form = useForm<NovoAtendimentoValues>({
    resolver: zodResolver(novoAtendimentoSchema),
    defaultValues: { leadId: "", cabineId: "", tipo: "ATENDIMENTO", inicio: "", observacao: "" },
  });

  const onSubmit = async (values: NovoAtendimentoValues) => {
    try {
      const criado = await createAtendimento.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          leadId: values.leadId,
          cabineId: values.cabineId,
          vendedoraId: user!.id,
          tipo: values.tipo,
          inicio: new Date(values.inicio).toISOString(),
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
      setOpen(false);
    } catch (err) {
      toast({
        title: "Erro ao agendar",
        description: err instanceof Error ? err.message : "Verifique conflito de horário e tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Agenda</h1>
        <div className="flex items-center gap-2">
          {activeLojaId && (
            <Button asChild variant="ghost">
              <Link to={`/loja/${activeLojaId}/atendimentos`}>Fila de atendimentos</Link>
            </Button>
          )}
          {podeCriar && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="leadId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Noiva *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha a noiva" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(leads.data ?? []).map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>{lead.noivaNome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cabineId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cabine *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Cabine" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(cabines.data ?? []).filter((c) => c.ativo).map((cabine) => (
                            <SelectItem key={cabine.id} value={cabine.id}>{cabine.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ATENDIMENTO">Atendimento</SelectItem>
                          <SelectItem value="PROVA">Prova</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="inicio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data e hora *</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="observacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observação</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createAtendimento.isPending}>
                  {createAtendimento.isPending ? "Agendando…" : "Agendar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Atendimentos do Dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {atendimentos.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao carregar os atendimentos</AlertTitle>
                <AlertDescription className="flex items-center gap-3">
                  <span>Falha ao buscar a agenda.</span>
                  <Button variant="outline" size="sm" onClick={() => atendimentos.refetch()}>
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : atendimentos.isLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-md" />)}
              </div>
            ) : doDia.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhum atendimento agendado para hoje.</div>
            ) : (
              doDia.map(atendimento => {
                const wa = atendimento.situacao === "AGENDADO" ? waConfirmacao(atendimento) : null;
                return (
                  <div key={atendimento.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {nomePorLead.get(atendimento.leadId) ?? "Noiva"} — {atendimento.tipo === "PROVA" ? "Prova" : "Atendimento"}
                        </p>
                        <p className="text-sm text-muted-foreground">{format(new Date(atendimento.inicio), "HH:mm")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {wa && (
                        <Button asChild variant="outline" size="sm">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="h-4 w-4 mr-1" />
                            Confirmar
                          </a>
                        </Button>
                      )}
                      <Badge>{SITUACAO_LABELS[atendimento.situacao] ?? atendimento.situacao}</Badge>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cabines</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {cabines.data?.map(cabine => (
                  <li key={cabine.id} className="flex items-center justify-between text-sm">
                    <span>{cabine.nome}</span>
                    <Badge variant={cabine.ativo ? "default" : "secondary"}>{cabine.ativo ? 'Ativa' : 'Inativa'}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ajustes Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              {(ajustes.data ?? []).filter(a => a.status === 'PENDENTE').length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">Nenhum ajuste pendente.</p>
              ) : (
                <ul className="space-y-3">
                  {ajustes.data?.filter(a => a.status === 'PENDENTE').map(ajuste => (
                    <li key={ajuste.id} className="text-sm border-b pb-2 last:border-0">
                      {ajuste.descricao}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
