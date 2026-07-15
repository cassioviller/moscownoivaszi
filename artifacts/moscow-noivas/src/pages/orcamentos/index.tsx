import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListOrcamentos,
  getListOrcamentosQueryKey,
  useCreateOrcamento,
  useListLeads,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { diaParaISO } from "@/lib/formatos";

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};

const novoOrcamentoSchema = z.object({
  leadId: z.string().min(1, "Escolha a noiva"),
  validade: z.string().optional(),
  observacoes: z.string().optional(),
});

type NovoOrcamentoValues = z.infer<typeof novoOrcamentoSchema>;

export default function Orcamentos() {
  const { activeLojaId, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: orcamentos, isLoading, isError, refetch } = useListOrcamentos(activeLojaId!, { query: { queryKey: getListOrcamentosQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const leads = useListLeads(activeLojaId!, { query: { queryKey: getListLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const createOrcamento = useCreateOrcamento();

  const nomePorLead = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const lead of leads.data ?? []) mapa.set(lead.id, lead.noivaNome);
    return mapa;
  }, [leads.data]);

  const form = useForm<NovoOrcamentoValues>({
    resolver: zodResolver(novoOrcamentoSchema),
    defaultValues: { leadId: "", validade: "", observacoes: "" },
  });

  const onSubmit = async (values: NovoOrcamentoValues) => {
    try {
      const criado = await createOrcamento.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          leadId: values.leadId,
          vendedoraId: user!.id,
          validade: values.validade ? diaParaISO(values.validade) : undefined,
          observacoes: values.observacoes || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListOrcamentosQueryKey(activeLojaId!) });
      toast({ title: "Orçamento criado", description: "Adicione os itens." });
      form.reset();
      setOpen(false);
      setLocation(`/orcamentos/${criado.id}`);
    } catch (err) {
      toast({
        title: "Erro ao criar orçamento",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Orçamentos</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Orçamento
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Orçamento</DialogTitle>
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
              <FormField
                control={form.control}
                name="validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
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
                <Button type="submit" disabled={createOrcamento.isPending}>
                  {createOrcamento.isPending ? "Criando…" : "Criar e adicionar itens"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-4">
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar os orçamentos</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              <span>Falha ao buscar os orçamentos.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          [1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse" />)
        ) : orcamentos?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">Nenhum orçamento encontrado.</div>
        ) : (
          orcamentos?.map(orcamento => (
            <Link key={orcamento.id} href={`/orcamentos/${orcamento.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center text-secondary-foreground">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">{nomePorLead.get(orcamento.leadId) ?? "Noiva"}</div>
                      <div className="text-sm text-muted-foreground">Criado em {new Date(orcamento.createdAt).toLocaleDateString("pt-BR")}</div>
                    </div>
                  </div>
                  <Badge variant={orcamento.status === "APROVADO" ? "default" : orcamento.status === "RECUSADO" ? "outline" : "secondary"}>
                    {STATUS_LABELS[orcamento.status] ?? orcamento.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
