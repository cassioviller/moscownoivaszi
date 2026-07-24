import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtributos,
  getListAtributosQueryKey,
  useUpdateAtributo,
  useCreateAtributoOpcao,
  useUpdateAtributoOpcao,
  type Atributo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const editarAtributoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  ativo: z.boolean(),
  // Opções nunca são apagadas (podem estar em uso em vestidos/interesses) —
  // apenas renomeadas ou desativadas.
  opcoes: z.array(
    z.object({
      id: z.string(),
      valor: z.string().min(1, "Valor é obrigatório"),
      ativo: z.boolean(),
    }),
  ),
  novasOpcoes: z.string().optional(),
});

type EditarAtributoValues = z.infer<typeof editarAtributoSchema>;

export default function EditarAtributo() {
  const { lojaId, atributoId } = useParams();
  const { activeLojaId } = useAuth();

  // O client gerado não expõe GET de atributo individual — busca na listagem.
  const { data: atributos, isLoading, isError, error, refetch } = useListAtributos(activeLojaId!, {
    query: {
      queryKey: getListAtributosQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  const atributo = atributos?.find((a) => a.id === atributoId);

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
        <h1 className="text-3xl font-serif">Editar atributo</h1>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar o atributo</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error instanceof Error ? error.message : "Falha inesperada."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading || !atributos ? (
        <Card className="animate-pulse h-64" />
      ) : !atributo ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Atributo não encontrado</AlertTitle>
          <AlertDescription>
            <Link to={`/loja/${lojaId}/catalogo`} className="underline">
              Voltar ao catálogo
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <EditarAtributoForm key={atributo.id} atributo={atributo} />
      )}
    </div>
  );
}

function EditarAtributoForm({ atributo }: { atributo: Atributo }) {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const updateAtributo = useUpdateAtributo();
  const createOpcao = useCreateAtributoOpcao();
  const updateOpcao = useUpdateAtributoOpcao();

  const opcoesOrdenadas = [...(atributo.opcoes ?? [])].sort((a, b) => a.ordem - b.ordem);

  const form = useForm<EditarAtributoValues>({
    resolver: zodResolver(editarAtributoSchema),
    defaultValues: {
      nome: atributo.nome,
      ativo: atributo.ativo,
      opcoes: opcoesOrdenadas.map((o) => ({ id: o.id, valor: o.valor, ativo: o.ativo })),
      novasOpcoes: "",
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: "opcoes" });

  const salvando = updateAtributo.isPending || createOpcao.isPending || updateOpcao.isPending;

  const onSubmit = async (values: EditarAtributoValues) => {
    const novas = (values.novasOpcoes ?? "")
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    try {
      if (values.nome !== atributo.nome || values.ativo !== atributo.ativo) {
        await updateAtributo.mutateAsync({
          lojaId: activeLojaId!,
          atributoId: atributo.id,
          data: { nome: values.nome, ativo: values.ativo },
        });
      }
      for (const opcao of values.opcoes) {
        const original = opcoesOrdenadas.find((o) => o.id === opcao.id);
        if (original && (original.valor !== opcao.valor || original.ativo !== opcao.ativo)) {
          await updateOpcao.mutateAsync({
            lojaId: activeLojaId!,
            opcaoId: opcao.id,
            data: { valor: opcao.valor, ativo: opcao.ativo },
          });
        }
      }
      // Novas opções em sequência, continuando a ordem existente.
      const proximaOrdem = opcoesOrdenadas.reduce((max, o) => Math.max(max, o.ordem + 1), 0);
      for (const [i, valor] of novas.entries()) {
        await createOpcao.mutateAsync({
          lojaId: activeLojaId!,
          atributoId: atributo.id,
          data: { valor, ordem: proximaOrdem + i },
        });
      }
      await queryClient.invalidateQueries({ queryKey: getListAtributosQueryKey(activeLojaId!) });
      toast({ title: "Atributo atualizado" });
      navigate(`/loja/${lojaId}/catalogo`);
    } catch (err) {
      await queryClient.invalidateQueries({ queryKey: getListAtributosQueryKey(activeLojaId!) });
      toast({
        title: "Erro ao salvar atributo",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
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
                    <Input placeholder="Ex.: Decote, Volume da saia" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* AtributoUpdate só aceita nome/ordem/ativo — o tipo não é editável. */}
            <div className="space-y-2">
              <FormLabel>Tipo</FormLabel>
              <Input
                value={atributo.tipo === "ESCALA" ? "Escala (grau)" : "Opção única"}
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">O tipo não pode ser alterado.</p>
            </div>

            <FormField
              control={form.control}
              name="ativo"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2.5 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                      data-testid="checkbox-atributo-ativo"
                    />
                  </FormControl>
                  <FormLabel className="font-normal text-sm">
                    Atributo ativo (aparece nos formulários)
                  </FormLabel>
                </FormItem>
              )}
            />

            {fields.length > 0 && (
              <fieldset className="space-y-2.5">
                <legend className="text-sm font-medium mb-1.5">Opções</legend>
                {fields.map((f, index) => (
                  <div key={f.id} className="flex items-center gap-2.5">
                    <FormField
                      control={form.control}
                      name={`opcoes.${index}.valor`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input aria-label={`Opção ${f.valor}`} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`opcoes.${index}.ativo`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-1.5 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(v) => field.onChange(v === true)}
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-xs text-muted-foreground">
                            ativa
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Opções não são apagadas — desative as que não devem mais aparecer.
                </p>
              </fieldset>
            )}

            <FormField
              control={form.control}
              name="novasOpcoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adicionar opções (uma por linha)</FormLabel>
                  <FormControl>
                    <Textarea rows={4} placeholder={"Tomara que caia\nV\nCoração"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} data-testid="button-salvar-atributo">
                {salvando ? "Salvando…" : "Salvar alterações"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to={`/loja/${lojaId}/catalogo`}>Cancelar</Link>
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
