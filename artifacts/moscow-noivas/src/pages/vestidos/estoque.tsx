import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListItensEstoque,
  getListItensEstoqueQueryKey,
  useCreateItemEstoque,
  useUpdateItemEstoque,
  useDeleteItemEstoque,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Erro } from "@/components/estado";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { brl } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";
import { parseValor } from "@/lib/financeiro/dinheiro";
import { nomeDoItemEstoque, quantidadeContada } from "@/lib/estoque-aviso";

/**
 * E154 — a arara que se conta.
 *
 * Saiote, crinol, anágua: a loja tem dez iguais, e reservar "o nº 7" não
 * significa nada porque ninguém vai atrás daquele. Por isso não moram no
 * acervo — cadastrá-los um a um encheria de anágua a mesma lista que a
 * vendedora abre com a noiva na cabine.
 *
 * `quantidade` é quantas a loja TEM, e é um número que a dona edita quando
 * conta a arara. O comprometimento por data nunca é gravado aqui: sai dos
 * contratos ativos, no aviso da tela de orçamento.
 */
const itemSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  tamanho: z.string(),
  quantidade: z.string(),
  preco: z.string(),
});
type ItemValues = z.infer<typeof itemSchema>;

const MENSAGENS_ERRO: Record<string, string> = {
  ITEM_ESTOQUE_NAO_ENCONTRADO: "Esta peça não existe mais nesta loja.",
};

export default function EstoqueVestidos() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [emEdicao, setEmEdicao] = useState<Record<string, string>>({});

  const podeGerir = podeNoModulo(acessosModulos, "vestidos", "editar");

  const { data: itens, isLoading, isError, error, refetch } = useListItensEstoque(activeLojaId!, {
    query: { queryKey: getListItensEstoqueQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const criar = useCreateItemEstoque();
  const atualizar = useUpdateItemEstoque();
  const remover = useDeleteItemEstoque();

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: getListItensEstoqueQueryKey(activeLojaId!) });

  const form = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: { nome: "", tamanho: "", quantidade: "1", preco: "" },
  });

  const onCriar = async (values: ItemValues) => {
    const quantidade = Math.trunc(Number(values.quantidade));
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      toast({ title: "Quantidade inválida", description: "Informe quantas peças a loja tem.", variant: "destructive" });
      return;
    }
    // Preço vazio é LEGÍTIMO: a peça vai junto com o vestido, sem cobrar à
    // parte. `parseValor` lê ponto de milhar e vírgula decimal como pt-BR.
    const preco = values.preco.trim() ? parseValor(values.preco) : null;
    if (preco !== null && (!Number.isFinite(preco) || preco < 0)) {
      toast({ title: "Preço inválido", variant: "destructive" });
      return;
    }
    try {
      await criar.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          nome: values.nome,
          quantidade,
          ...(values.tamanho.trim() ? { tamanho: values.tamanho.trim() } : {}),
          ...(preco !== null ? { preco } : {}),
        },
      });
      await invalidar();
      form.reset({ nome: "", tamanho: "", quantidade: "1", preco: "" });
      toast({ title: "Peça cadastrada" });
    } catch (err) {
      toast({
        title: "Não deu para cadastrar",
        // O 409 do par (nome, tamanho) repetido é o erro comum aqui.
        description: mensagemApi(err, "Talvez já exista uma peça com esse nome e tamanho.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const salvarQuantidade = async (itemEstoqueId: string, valor: string) => {
    // S-M11: `Number("")` é 0 — limpar o campo para redigitar zerava o
    // estoque. A régua mora em `quantidadeContada`, com o vazio recusado.
    const quantidade = quantidadeContada(valor);
    if (quantidade === null) {
      toast({ title: "Quantidade inválida", variant: "destructive" });
      return;
    }
    try {
      await atualizar.mutateAsync({ lojaId: activeLojaId!, itemEstoqueId, data: { quantidade } });
      await invalidar();
      setEmEdicao((atual) => {
        const proximo = { ...atual };
        delete proximo[itemEstoqueId];
        return proximo;
      });
    } catch (err) {
      toast({ title: "Não deu para salvar", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onRemover = async (itemEstoqueId: string) => {
    try {
      await remover.mutateAsync({ lojaId: activeLojaId!, itemEstoqueId });
      await invalidar();
      toast({ title: "Peça removida do estoque" });
    } catch (err) {
      toast({ title: "Não deu para remover", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif">Estoque</h1>
          <p className="text-sm text-muted-foreground mt-1">
            As peças que a loja conta em vez de reservar — saiote, crinol, anágua. O vestido e
            o acessório com nome próprio ficam no acervo.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link to={`/loja/${lojaId}/vestidos`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Vestidos
          </Link>
        </Button>
      </div>

      {podeGerir && (
        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onCriar)}
                className="flex flex-wrap items-end gap-2"
              >
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem className="w-56">
                      <FormLabel>Peça</FormLabel>
                      <FormControl>
                        <Input placeholder="Saiote 2 aros" data-testid="input-estoque-nome" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tamanho"
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormLabel>Tamanho</FormLabel>
                      <FormControl>
                        <Input placeholder="—" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantidade"
                  render={({ field }) => (
                    <FormItem className="w-28">
                      <FormLabel>Quantas</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" data-testid="input-estoque-quantidade" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="preco"
                  render={({ field }) => (
                    <FormItem className="w-32">
                      <FormLabel>Preço</FormLabel>
                      <FormControl>
                        <Input placeholder="vai junto" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={criar.isPending} data-testid="button-criar-estoque">
                  <Plus className="h-4 w-4 mr-2" />
                  Cadastrar
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {isError ? (
        <Erro titulo="Não deu para carregar o estoque" erro={error} onTentarNovamente={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-16" />
          ))}
        </div>
      ) : (itens ?? []).length === 0 ? (
        <div className="text-center py-12 space-y-1">
          <p className="text-muted-foreground">Nenhuma peça de estoque cadastrada ainda.</p>
          <p className="text-sm text-muted-foreground">
            {podeGerir
              ? "Cadastre os saiotes e crinóis que hoje só existem como frase no contrato — e diga quantos são de cada."
              : "Peça à administração para cadastrar o estoque."}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y" data-testid="lista-estoque">
              {(itens ?? []).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{nomeDoItemEstoque(item)}</span>
                      {!item.ativo && (
                        <Badge variant="outline" className="text-xs">inativo</Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.preco != null ? brl(item.preco) : "vai junto com o vestido"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {podeGerir ? (
                      <>
                        <Input
                          type="number"
                          min="0"
                          className="w-20"
                          aria-label={`Quantas ${nomeDoItemEstoque(item)}`}
                          data-testid={`input-quantidade-${item.id}`}
                          value={emEdicao[item.id] ?? String(item.quantidade)}
                          onChange={(e) =>
                            setEmEdicao((atual) => ({ ...atual, [item.id]: e.target.value }))
                          }
                        />
                        {emEdicao[item.id] !== undefined &&
                          emEdicao[item.id] !== String(item.quantidade) && (
                            <Button
                              size="sm"
                              onClick={() => salvarQuantidade(item.id, emEdicao[item.id])}
                              data-testid={`button-salvar-${item.id}`}
                            >
                              Salvar
                            </Button>
                          )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Remover ${nomeDoItemEstoque(item)}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover {nomeDoItemEstoque(item)}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Os contratos que já venderam esta peça continuam com a descrição
                                em texto — o que foi vendido não muda. O que se perde é a
                                contagem futura dela.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onRemover(item.id)}>
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <span className="text-sm tabular-nums">{item.quantidade} na loja</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
