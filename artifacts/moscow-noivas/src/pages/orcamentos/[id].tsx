import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetOrcamento,
  getGetOrcamentoQueryKey,
  useAddOrcamentoItem,
  useRemoveOrcamentoItem,
  useAprovarOrcamento,
  useRecusarOrcamento,
  useUpdateOrcamento,
  useCreateContrato,
  getListContratosQueryKey,
  useListLeads,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addMonths, format } from "date-fns";
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
import { Trash2, AlertCircle, ScrollText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl, diaParaISO } from "@/lib/formatos";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

const novoItemSchema = z.object({
  tipo: z.enum(["VESTIDO", "SERVICO", "AJUSTE"]),
  descricao: z.string().min(1, "Descrição obrigatória"),
  valorUnitario: z.string().min(1, "Valor obrigatório"),
  quantidade: z.string(),
});
type NovoItemValues = z.infer<typeof novoItemSchema>;

const gerarContratoSchema = z.object({
  cpf: z.string().optional(),
  formaPagamento: z.string().optional(),
  dataCasamento: z.string().optional(),
  entrada: z.string(),
  numParcelas: z.string(),
  primeiroVencimento: z.string().min(1, "Informe o primeiro vencimento"),
});
type GerarContratoValues = z.infer<typeof gerarContratoSchema>;

const FORMAS = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "BOLETO", "TRANSFERENCIA", "OUTRO"] as const;

export default function OrcamentoDetail() {
  const { activeLojaId, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/orcamentos/:id");
  const id = params?.id;
  const [contratoOpen, setContratoOpen] = useState(false);

  const { data: orcamento, isLoading, isError, refetch } = useGetOrcamento(activeLojaId!, id!, {
    query: { queryKey: getGetOrcamentoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });
  const leads = useListLeads(activeLojaId!, {
    query: { queryKey: getListLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const addItem = useAddOrcamentoItem();
  const removeItem = useRemoveOrcamentoItem();
  const aprovar = useAprovarOrcamento();
  const recusar = useRecusarOrcamento();
  const atualizar = useUpdateOrcamento();
  const createContrato = useCreateContrato();

  const lead = useMemo(
    () => leads.data?.find((l) => l.id === orcamento?.leadId),
    [leads.data, orcamento?.leadId],
  );

  const totais = useMemo(() => {
    const bruto = round2((orcamento?.itens ?? []).reduce((acc, it) => acc + it.quantidade * it.valorUnitario, 0));
    let liquido = bruto;
    if (orcamento?.descontoTipo === "PERCENTUAL" && orcamento.descontoValor) {
      liquido = round2(bruto * (1 - orcamento.descontoValor / 100));
    } else if (orcamento?.descontoTipo === "VALOR" && orcamento.descontoValor) {
      liquido = round2(bruto - orcamento.descontoValor);
    }
    return { bruto, liquido: Math.max(0, liquido) };
  }, [orcamento]);

  const itemForm = useForm<NovoItemValues>({
    resolver: zodResolver(novoItemSchema),
    defaultValues: { tipo: "VESTIDO", descricao: "", valorUnitario: "", quantidade: "1" },
  });

  const contratoForm = useForm<GerarContratoValues>({
    resolver: zodResolver(gerarContratoSchema),
    defaultValues: { cpf: "", formaPagamento: "", dataCasamento: "", entrada: "0", numParcelas: "1", primeiroVencimento: "" },
  });

  // Desconto (aplicado via PATCH; estado local só para os inputs).
  const [descontoTipo, setDescontoTipo] = useState<string>("");
  const [descontoValor, setDescontoValor] = useState<string>("");

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar o orçamento</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          <span>Falha ao buscar o orçamento.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;
  if (!orcamento) return <div>Orçamento não encontrado.</div>;

  const editavel = orcamento.status === "RASCUNHO" || orcamento.status === "ENVIADO";
  const invalidar = () => queryClient.invalidateQueries({ queryKey: getGetOrcamentoQueryKey(activeLojaId!, id!) });

  const onAddItem = async (values: NovoItemValues) => {
    const valorUnitario = Number(values.valorUnitario);
    const quantidade = Number(values.quantidade) || 1;
    if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) {
      toast({ title: "Valor unitário inválido", variant: "destructive" });
      return;
    }
    try {
      await addItem.mutateAsync({
        lojaId: activeLojaId!,
        orcamentoId: id!,
        data: { tipo: values.tipo, descricao: values.descricao, valorUnitario, quantidade },
      });
      await invalidar();
      itemForm.reset({ tipo: values.tipo, descricao: "", valorUnitario: "", quantidade: "1" });
    } catch (err) {
      toast({ title: "Erro ao adicionar item", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const onRemoveItem = async (itemId: string) => {
    try {
      await removeItem.mutateAsync({ lojaId: activeLojaId!, itemId });
      await invalidar();
    } catch (err) {
      toast({ title: "Erro ao remover item", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const onAplicarDesconto = async () => {
    const valor = Number(descontoValor);
    if (!descontoTipo || !Number.isFinite(valor) || valor <= 0) {
      toast({ title: "Informe tipo e valor do desconto", variant: "destructive" });
      return;
    }
    try {
      await atualizar.mutateAsync({
        lojaId: activeLojaId!,
        orcamentoId: id!,
        data: { descontoTipo: descontoTipo as "PERCENTUAL" | "VALOR", descontoValor: valor },
      });
      await invalidar();
      toast({ title: "Desconto aplicado" });
    } catch (err) {
      toast({ title: "Erro ao aplicar desconto", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const onAprovar = async () => {
    try {
      await aprovar.mutateAsync({ lojaId: activeLojaId!, orcamentoId: id! });
      await invalidar();
      toast({ title: "Orçamento aprovado" });
    } catch (err) {
      toast({ title: "Erro ao aprovar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const onRecusar = async () => {
    try {
      await recusar.mutateAsync({ lojaId: activeLojaId!, orcamentoId: id! });
      await invalidar();
      toast({ title: "Orçamento recusado" });
    } catch (err) {
      toast({ title: "Erro ao recusar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const onGerarContrato = async (values: GerarContratoValues) => {
    const total = totais.liquido;
    const entrada = round2(Number(values.entrada) || 0);
    const numParcelas = Math.max(0, Math.trunc(Number(values.numParcelas) || 0));
    const restante = round2(total - entrada);

    if (total <= 0) {
      toast({ title: "Orçamento sem itens", description: "Adicione itens antes de gerar o contrato.", variant: "destructive" });
      return;
    }
    if (entrada < 0 || entrada > total) {
      toast({ title: "Entrada inválida", description: "A entrada não pode superar o total.", variant: "destructive" });
      return;
    }
    if (restante > 0 && numParcelas < 1) {
      toast({ title: "Informe o número de parcelas", variant: "destructive" });
      return;
    }

    // Parcelas: entrada = número 0; restante dividido igualmente, com o ajuste
    // de centavos na última parcela (a soma PRECISA bater com o total — 422).
    const parcelas: { numero: number; descricao?: string; valorPrevisto: number; vencimento: string }[] = [];
    if (entrada > 0) {
      parcelas.push({ numero: 0, descricao: "Entrada", valorPrevisto: entrada, vencimento: new Date().toISOString() });
    }
    if (restante > 0) {
      const base = Math.floor((restante / numParcelas) * 100) / 100;
      const primeiro = new Date(`${values.primeiroVencimento}T12:00:00-03:00`);
      for (let i = 1; i <= numParcelas; i++) {
        const valor = i === numParcelas ? round2(restante - base * (numParcelas - 1)) : base;
        parcelas.push({
          numero: i,
          valorPrevisto: valor,
          vencimento: addMonths(primeiro, i - 1).toISOString(),
        });
      }
    }

    try {
      const contrato = await createContrato.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          leadId: orcamento.leadId,
          orcamentoId: orcamento.id,
          vendedoraId: user!.id,
          valorTotal: total,
          cpf: values.cpf || undefined,
          formaPagamento: (values.formaPagamento || undefined) as (typeof FORMAS)[number] | undefined,
          dataCasamento: values.dataCasamento ? diaParaISO(values.dataCasamento) : undefined,
          parcelas,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListContratosQueryKey(activeLojaId!) });
      toast({ title: "Contrato gerado" });
      setContratoOpen(false);
      setLocation(`/contratos/${contrato.id}`);
    } catch (err) {
      toast({
        title: "Erro ao gerar contrato",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif">Orçamento — {lead?.noivaNome ?? "Noiva"}</h1>
          <p className="text-sm text-muted-foreground">Criado em {format(new Date(orcamento.createdAt), "dd/MM/yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-sm px-3 py-1">{orcamento.status}</Badge>
          {editavel && (
            <>
              <Button variant="outline" size="sm" onClick={onRecusar} disabled={recusar.isPending}>
                Recusar
              </Button>
              <Button size="sm" onClick={onAprovar} disabled={aprovar.isPending}>
                Aprovar
              </Button>
            </>
          )}
          {orcamento.status === "APROVADO" && (
            <Button size="sm" onClick={() => setContratoOpen(true)}>
              <ScrollText className="h-4 w-4 mr-2" />
              Gerar contrato
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens do Orçamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orcamento.itens && orcamento.itens.length > 0 ? (
            <ul className="space-y-4">
              {orcamento.itens.map(item => (
                <li key={item.id} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <p className="font-medium">{item.descricao}</p>
                    <p className="text-sm text-muted-foreground">Qtd: {item.quantidade} x R$ {brl(item.valorUnitario)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">R$ {brl(item.quantidade * item.valorUnitario)}</span>
                    {editavel && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover item"
                        disabled={removeItem.isPending}
                        onClick={() => onRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nenhum item adicionado.</p>
          )}

          <div className="flex justify-end gap-6 text-sm border-t pt-3">
            <span className="text-muted-foreground">Subtotal: R$ {brl(totais.bruto)}</span>
            {orcamento.descontoTipo && orcamento.descontoValor ? (
              <span className="text-muted-foreground">
                Desconto: {orcamento.descontoTipo === "PERCENTUAL" ? `${orcamento.descontoValor}%` : `R$ ${brl(orcamento.descontoValor)}`}
              </span>
            ) : null}
            <span className="font-semibold text-primary">Total: R$ {brl(totais.liquido)}</span>
          </div>

          {editavel && (
            <>
              <Form {...itemForm}>
                <form onSubmit={itemForm.handleSubmit(onAddItem)} className="flex flex-wrap items-end gap-2 border-t pt-4">
                  <FormField
                    control={itemForm.control}
                    name="tipo"
                    render={({ field }) => (
                      <FormItem className="w-32">
                        <FormLabel>Tipo</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="VESTIDO">Vestido</SelectItem>
                            <SelectItem value="SERVICO">Serviço</SelectItem>
                            <SelectItem value="AJUSTE">Ajuste</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={itemForm.control}
                    name="descricao"
                    render={({ field }) => (
                      <FormItem className="flex-1 min-w-40">
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                          <Input placeholder="Vestido Sereia" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={itemForm.control}
                    name="valorUnitario"
                    render={({ field }) => (
                      <FormItem className="w-32">
                        <FormLabel>Valor (R$)</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="5000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={itemForm.control}
                    name="quantidade"
                    render={({ field }) => (
                      <FormItem className="w-20">
                        <FormLabel>Qtd</FormLabel>
                        <FormControl>
                          <Input inputMode="numeric" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={addItem.isPending}>Adicionar</Button>
                </form>
              </Form>

              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <div className="w-36">
                  <label className="text-xs text-muted-foreground">Tipo de desconto</label>
                  <Select value={descontoTipo} onValueChange={setDescontoTipo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Desconto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTUAL">Percentual (%)</SelectItem>
                      <SelectItem value="VALOR">Valor (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-muted-foreground">Valor</label>
                  <Input inputMode="decimal" value={descontoValor} onChange={(e) => setDescontoValor(e.target.value)} />
                </div>
                <Button variant="outline" onClick={onAplicarDesconto} disabled={atualizar.isPending}>
                  Aplicar desconto
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={contratoOpen} onOpenChange={setContratoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar contrato — R$ {brl(totais.liquido)}</DialogTitle>
          </DialogHeader>
          <Form {...contratoForm}>
            <form onSubmit={contratoForm.handleSubmit(onGerarContrato)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={contratoForm.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF da noiva</FormLabel>
                      <FormControl>
                        <Input placeholder="000.000.000-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contratoForm.control}
                  name="formaPagamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de pagamento</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FORMAS.map((forma) => (
                            <SelectItem key={forma} value={forma}>{forma.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={contratoForm.control}
                name="dataCasamento"
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
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={contratoForm.control}
                  name="entrada"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Entrada (R$)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contratoForm.control}
                  name="numParcelas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº de parcelas</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={contratoForm.control}
                  name="primeiroVencimento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>1º vencimento *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setContratoOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createContrato.isPending}>
                  {createContrato.isPending ? "Gerando…" : "Gerar contrato"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
