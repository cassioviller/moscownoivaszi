import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { podeNoModulo } from "@/lib/permissoes";
import { useListLeads, getListLeadsQueryKey, useCreateLead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "@/lib/router-compat";
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
import { Plus, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { dataDia, etapaLabel, diaParaISO } from "@/lib/formatos";

const novoLeadSchema = z.object({
  noivaNome: z.string().min(1, "Nome da noiva é obrigatório"),
  noivoNome: z.string().optional(),
  whatsapp: z.string().optional(),
  casamentoData: z.string().optional(),
  origem: z.enum(["LOJA", "WHATSAPP"]),
});

type NovoLeadValues = z.infer<typeof novoLeadSchema>;

export default function Leads() {
  const { activeLojaId, acessosModulos } = useAuth();
  const podeCriar = podeNoModulo(acessosModulos, "leads", "criar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: leads, isLoading, isError, error, refetch } = useListLeads(activeLojaId!, {
    query: {
      queryKey: getListLeadsQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    }
  });
  const createLead = useCreateLead();

  const form = useForm<NovoLeadValues>({
    resolver: zodResolver(novoLeadSchema),
    defaultValues: { noivaNome: "", noivoNome: "", whatsapp: "", casamentoData: "", origem: "LOJA" },
  });

  const onSubmit = async (values: NovoLeadValues) => {
    try {
      const criado = await createLead.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          noivaNome: values.noivaNome,
          noivoNome: values.noivoNome || undefined,
          whatsapp: values.whatsapp || undefined,
          casamentoData: values.casamentoData ? diaParaISO(values.casamentoData) : undefined,
          origem: values.origem,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey(activeLojaId!) });
      toast({ title: "Lead cadastrado" });
      form.reset();
      setOpen(false);
      setLocation(`/leads/${criado.id}`);
    } catch (err) {
      toast({
        title: "Erro ao cadastrar lead",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Leads</h1>
        {podeCriar && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Lead
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="noivaNome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da noiva *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ana Souza" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="noivoNome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do noivo</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="whatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp</FormLabel>
                      <FormControl>
                        <Input placeholder="(11) 99999-9999" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="casamentoData"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data do casamento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="origem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origem</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="LOJA">Loja</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createLead.isPending}>
                  {createLead.isPending ? "Salvando…" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar os leads</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error instanceof Error ? error.message : "Falha inesperada."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-32"></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads?.map((lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{lead.noivaNome}</span>
                    <Badge variant={lead.etapa === "PERDIDO" ? "outline" : "secondary"}>{etapaLabel(lead.etapa)}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Data: {lead.casamentoData ? dataDia(lead.casamentoData) : "Não informada"}
                  </p>
                  {lead.whatsapp && (
                    <p className="text-sm text-muted-foreground mt-1">
                      WhatsApp: {lead.whatsapp}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}

          {leads?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Nenhum lead encontrado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
