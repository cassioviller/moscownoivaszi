import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useCreateAtributo,
  useCreateAtributoOpcao,
  getListAtributosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirmarSaida } from "@/hooks/use-confirmar-saida";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";

const novoAtributoSchema = z.object({
  nome: z.string().min(1, "Informe o nome"),
  tipo: z.enum(["OPCAO_UNICA", "ESCALA"]),
  novasOpcoes: z.string().optional(),
});

type NovoAtributoValues = z.infer<typeof novoAtributoSchema>;

export default function NovoAtributo() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createAtributo = useCreateAtributo();
  const createOpcao = useCreateAtributoOpcao();

  const form = useForm<NovoAtributoValues>({
    resolver: zodResolver(novoAtributoSchema),
    defaultValues: { nome: "", tipo: "OPCAO_UNICA", novasOpcoes: "" },
  });

  // E133/B7: fechar/recarregar com trabalho digitado avisa; cala após o
  // submit bem-sucedido (a tela navega sem reset).
  useConfirmarSaida(form.formState.isDirty && !form.formState.isSubmitSuccessful);

  const salvando = createAtributo.isPending || createOpcao.isPending;

  const onSubmit = async (values: NovoAtributoValues) => {
    const valores = (values.novasOpcoes ?? "")
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    try {
      const atributo = await createAtributo.mutateAsync({
        lojaId: activeLojaId!,
        data: { nome: values.nome, tipo: values.tipo },
      });
      // Opções em sequência para preservar a ordem digitada (uma por linha).
      for (const [i, valor] of valores.entries()) {
        await createOpcao.mutateAsync({
          lojaId: activeLojaId!,
          atributoId: atributo.id,
          data: { valor, ordem: i },
        });
      }
      await queryClient.invalidateQueries({ queryKey: getListAtributosQueryKey(activeLojaId!) });
      toast({ title: "Atributo criado" });
      navigate(`/loja/${lojaId}/catalogo`);
    } catch (err) {
      await queryClient.invalidateQueries({ queryKey: getListAtributosQueryKey(activeLojaId!) });
      toast({
        title: "Não deu para criar atributo",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-1">
        <Link
          to={`/loja/${lojaId}/catalogo`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Catálogo
        </Link>
        <h1 className="text-3xl font-serif">Novo atributo</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Decote, Volume da saia" autoFocus {...field} />
                    </FormControl>
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
                        <SelectTrigger data-testid="select-tipo-atributo">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="OPCAO_UNICA">Opção única</SelectItem>
                        <SelectItem value="ESCALA">Escala (grau)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="novasOpcoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opções (uma por linha)</FormLabel>
                    <FormControl>
                      <Textarea rows={4} placeholder={"Tomara que caia\nV\nCoração"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={salvando} data-testid="button-criar-atributo">
                  {salvando ? "Salvando…" : "Criar atributo"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link to={`/loja/${lojaId}/catalogo`}>Cancelar</Link>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
