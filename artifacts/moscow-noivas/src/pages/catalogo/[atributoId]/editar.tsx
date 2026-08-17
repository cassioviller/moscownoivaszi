import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtributos,
  getListAtributosQueryKey,
  useUpdateAtributo,
  useCreateAtributoOpcao,
  useUpdateAtributoOpcao,
  useDeleteAtributo,
  useDeleteAtributoOpcao,
  type Atributo,
} from "@workspace/api-client-react";
import { useState } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { useConfirmarSaida, sujoParaConfirmar } from "@/hooks/use-confirmar-saida";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, AlertCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { Erro } from "@/components/estado";

const editarAtributoSchema = z.object({
  nome: z.string().min(1, "Informe o nome"),
  ativo: z.boolean(),
  // Opções nunca são apagadas (podem estar em uso em vestidos/interesses) —
  // apenas renomeadas ou desativadas.
  opcoes: z.array(
    z.object({
      // **`opcaoId`, e não `id`, de propósito (S-R7).** O `useFieldArray`
      // publica a chave DELE em `field.id` e sobrescreve o que houver ali: um
      // campo chamado `id` some da linha renderizada, e foi por isso que o
      // "apagar" resolvia o alvo por posição em vez de identidade.
      opcaoId: z.string(),
      valor: z.string().min(1, "Informe o valor"),
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
    query: { ...CACHE_ESTAVEL,
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
        <Erro titulo="Não deu para carregar o atributo" erro={error} onTentarNovamente={() => refetch()} />
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
  /**
   * S-O131 — apagar atributo e apagar opção tinham porta (`DELETE`, com o 409
   * `ATRIBUTO_EM_USO`/`OPCAO_EM_USO` que nomeia quantas peças e noivas a
   * classificação alcança) e não tinham tela: esta página criava e editava, e
   * a frase dizia "opções não são apagadas". Agora: o que está sem uso sai; o
   * que classifica alguém, a porta recusa e a frase dela ensina a desativar.
   */
  const deleteAtributo = useDeleteAtributo();
  const deleteOpcao = useDeleteAtributoOpcao();
  const [confirmarApagarAtributo, setConfirmarApagarAtributo] = useState(false);
  const [opcaoParaApagar, setOpcaoParaApagar] = useState<{ id: string; valor: string } | null>(null);

  const onApagarAtributo = async () => {
    try {
      await deleteAtributo.mutateAsync({ lojaId: activeLojaId!, atributoId: atributo.id });
      await queryClient.invalidateQueries({ queryKey: getListAtributosQueryKey(activeLojaId!) });
      toast({ title: "Atributo apagado", description: `"${atributo.nome}" saiu do catálogo.` });
      navigate(`/loja/${lojaId}/catalogo`);
    } catch (err) {
      setConfirmarApagarAtributo(false);
      toast({ title: "Não deu para apagar o atributo", description: mensagemApi(err, "Tente novamente."), variant: "destructive" });
    }
  };
  /**
   * **S-R7 — a opção que sai é a opção em que se clicou.**
   *
   * O alvo era resolvido por POSIÇÃO (`opcoesOrdenadas[index]`), e as duas
   * listas que essa posição indexa andam em ritmos diferentes: `fields` é do
   * `useFieldArray` e nasce no mount (a `key` do formulário é o id do
   * ATRIBUTO, que não muda quando uma opção sai), enquanto `opcoesOrdenadas`
   * vem da prop e encolhe no refetch. Do segundo clique em diante o índice
   * apontava para a opção de BAIXO: o X do "Champagne" apagava o "Marfim", e o
   * clique na última linha era engolido pelo `if (opcao)`.
   *
   * Agora o alvo vem do próprio formulário — a mesma fonte que desenhou a
   * linha —, e é a IDENTIDADE que viaja até o `DELETE`. A lista de linhas
   * encolhe junto, por `reset`: o `remove()` do `useFieldArray` também
   * encolheria, mas ligaria `isDirty`, e sair da tela passaria a perguntar
   * "você tem coisa digitada que ainda não foi salva" logo depois de um gesto
   * já salvo (a lição da S13/E97 — no Playwright o `confirm` é auto-dismissado
   * e a navegação morre calada). O que estava digitado nas outras linhas
   * continua na tela e continua indo no submit, que compara por id contra o
   * servidor.
   */
  const onApagarOpcao = async () => {
    if (!opcaoParaApagar) return;
    try {
      await deleteOpcao.mutateAsync({ lojaId: activeLojaId!, opcaoId: opcaoParaApagar.id });
      await queryClient.invalidateQueries({ queryKey: getListAtributosQueryKey(activeLojaId!) });
      const valores = form.getValues();
      form.reset({ ...valores, opcoes: valores.opcoes.filter((o) => o.opcaoId !== opcaoParaApagar.id) });
      toast({ title: "Opção apagada", description: `"${opcaoParaApagar.valor}" saiu de "${atributo.nome}".` });
      setOpcaoParaApagar(null);
    } catch (err) {
      setOpcaoParaApagar(null);
      toast({ title: "Não deu para apagar a opção", description: mensagemApi(err, "Tente novamente."), variant: "destructive" });
    }
  };

  const opcoesOrdenadas = [...(atributo.opcoes ?? [])].sort((a, b) => a.ordem - b.ordem);

  const form = useForm<EditarAtributoValues>({
    resolver: zodResolver(editarAtributoSchema),
    defaultValues: {
      nome: atributo.nome,
      ativo: atributo.ativo,
      opcoes: opcoesOrdenadas.map((o) => ({ opcaoId: o.id, valor: o.valor, ativo: o.ativo })),
      novasOpcoes: "",
    },
  });

  // E133/B7: fechar/recarregar com trabalho digitado avisa; cala após o
  // submit bem-sucedido (a tela navega sem reset).
  useConfirmarSaida(sujoParaConfirmar(form.formState));
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
        const original = opcoesOrdenadas.find((o) => o.id === opcao.opcaoId);
        if (original && (original.valor !== opcao.valor || original.ativo !== opcao.ativo)) {
          await updateOpcao.mutateAsync({
            lojaId: activeLojaId!,
            opcaoId: opcao.opcaoId,
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
        title: "Não deu para salvar atributo",
        description: mensagemApi(err, "Tente novamente."),
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
            {/* S-O146: era <FormLabel> fora de <FormField> — `useFormField` estoura e a
                tela INTEIRA caía em "Esta tela quebrou" ao abrir qualquer atributo.
                Nenhum E2E abria a edição; o 64 (S-O131) foi o primeiro e a achou. */}
            <div className="space-y-2">
              <Label>Tipo</Label>
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
                  // `f.id` é a chave do useFieldArray (ele reusa o nome `id` e
                  // apaga o da opção); a identidade da opção mora no VALOR da
                  // linha, em `opcoes.${index}.opcaoId` — ver S-R7 acima. O
                  // nome CERTO do campo é o que a varredura da S-RM8 cobra
                  // (`campo-id-em-field-array-varredura.test.ts`); este
                  // comentário ainda dizia `.id`, o nome que o E253 aposentou.
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Apagar opção ${f.valor}`}
                      onClick={() => {
                        const opcao = form.getValues(`opcoes.${index}`);
                        setOpcaoParaApagar({ id: opcao.opcaoId, valor: opcao.valor });
                      }}
                      data-testid={`apagar-opcao-${f.opcaoId}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Uma opção sem uso pode ser apagada; a que já classifica peça ou noiva, o sistema recusa —
                  desative-a para ela não aparecer mais.
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
              <Button
                type="button"
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={() => setConfirmarApagarAtributo(true)}
                data-testid="apagar-atributo"
              >
                Apagar atributo
              </Button>
            </div>
          </form>
        </Form>

        <AlertDialog open={confirmarApagarAtributo} onOpenChange={setConfirmarApagarAtributo}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar o atributo "{atributo.nome}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Só sai o atributo que não classifica peça nem noiva. Se já classificar, o sistema recusa e diz
                quantas — e o caminho é desmarcar "Atributo ativo".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={onApagarAtributo} disabled={deleteAtributo.isPending} data-testid="confirmar-apagar-atributo">
                {deleteAtributo.isPending ? "Apagando…" : "Apagar atributo"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={!!opcaoParaApagar} onOpenChange={(v) => !v && setOpcaoParaApagar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar a opção "{opcaoParaApagar?.valor}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Só sai a opção sem uso. Se ela já classificar peça ou noiva, o sistema recusa — desative-a.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={onApagarOpcao} disabled={deleteOpcao.isPending} data-testid="confirmar-apagar-opcao">
                {deleteOpcao.isPending ? "Apagando…" : "Apagar opção"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
