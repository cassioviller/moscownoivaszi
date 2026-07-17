import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetContrato,
  getGetContratoQueryKey,
  useCancelarContrato,
  getListContratosQueryKey,
  getListParcelasQueryKey,
  useGerarPlanoParcelas,
  useReceberParcela,
  useEstornarParcela,
  useRemoveParcela,
  type Parcela,
  type ReceberParcelaInputFormaRecebimento,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl, diaParaISO } from "@/lib/formatos";
import { ROTULO_FORMA, rotuloForma, estaAtrasada } from "@/lib/financeiro/forma";
import { hojeLocal } from "@/lib/financeiro/datas";
import { centavos, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { podeNoModulo } from "@/lib/permissoes";

const MENSAGENS_ERRO: Record<string, string> = {
  JA_TEM_PLANO: "Este contrato já tem um plano de pagamento.",
  ENTRADA_MAIOR: "A entrada não pode ser maior que o total do contrato.",
  CONTRATO_NAO_ATIVO: "Contrato cancelado — sem movimentação de parcelas.",
  CONTRATO_JA_CANCELADO: "Contrato já está cancelado.",
  PARCELA_NAO_PAGA: "Este recebimento não está pago — nada a estornar.",
  PARCELA_NAO_PREVISTA: "Só parcelas em aberto podem ser removidas.",
  PARCELA_JA_RECEBIDA: "Esta parcela já foi recebida.",
  PARCELA_CANCELADA: "Parcela cancelada não pode ser recebida.",
};

function mensagemApi(err: unknown, fallback: string): string {
  const e = err as { data?: { error?: string; detalhe?: string } } | undefined;
  const codigo = e?.data?.error;
  if (codigo && MENSAGENS_ERRO[codigo]) return MENSAGENS_ERRO[codigo];
  if (e?.data?.detalhe) return e.data.detalhe;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * "1.234,56" ou "1234.56" → número em reais; null quando vazio; NaN quando
 * inválido. O ponto só vale como decimal quando não pode ser separador de
 * milhar pt-BR (exatamente 3 dígitos após o último ponto): "1.234" é mil
 * duzentos e trinta e quatro, "1.23" é um e vinte e três.
 */
function parseValor(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  let normalizado: string;
  if (t.includes(",")) {
    normalizado = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normalizado = t.replace(/\./g, "");
  } else {
    normalizado = t;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : Number.NaN;
}

export default function ContratoDetail() {
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lojaId: lojaIdParam, id } = useParams();
  const lojaId = lojaIdParam ?? activeLojaId;

  // Cancelamento
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [destinoPago, setDestinoPago] = useState<"manter" | "estornar">("manter");

  // Gerar plano
  const [entrada, setEntrada] = useState("");
  const [numParcelas, setNumParcelas] = useState("1");
  const [primeiroVencimento, setPrimeiroVencimento] = useState("");
  const [periodicidadeDias, setPeriodicidadeDias] = useState("30");

  // Receber parcela
  const [parcelaReceber, setParcelaReceber] = useState<Parcela | null>(null);
  const [valorRecebido, setValorRecebido] = useState("");
  const [formaRecebimento, setFormaRecebimento] = useState<ReceberParcelaInputFormaRecebimento | "">("");

  // Confirmação de remover/estornar
  const [confirmacao, setConfirmacao] = useState<{ tipo: "remover" | "estornar"; parcela: Parcela } | null>(null);

  const { data: contrato, isLoading, isError, refetch } = useGetContrato(activeLojaId!, id!, {
    query: { queryKey: getGetContratoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });

  const cancelar = useCancelarContrato();
  const gerarPlano = useGerarPlanoParcelas();
  const receber = useReceberParcela();
  const estornar = useEstornarParcela();
  const remover = useRemoveParcela();
  const podeEditar = podeNoModulo(acessosModulos, "leads", "editar");

  const parcelas = useMemo(
    () => [...(contrato?.parcelas ?? [])].sort((a, b) => a.numero - b.numero),
    [contrato?.parcelas],
  );
  const hoje = hojeLocal();
  const atrasada = (p: Parcela) => estaAtrasada(p, hoje);

  const totalPlanoCentavos = useMemo(
    () => somaCentavos(parcelas.filter((p) => p.status !== "CANCELADA"), (p) => p.valorPrevisto),
    [parcelas],
  );
  const planoDivergente =
    parcelas.length > 0 && contrato != null && totalPlanoCentavos !== centavos(contrato.valorTotal);

  const invalidarParcelas = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetContratoQueryKey(activeLojaId!, id!) }),
      queryClient.invalidateQueries({ queryKey: getListParcelasQueryKey(activeLojaId!) }),
    ]);

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar o contrato</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          <span>Falha ao buscar o contrato.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;
  if (!contrato) return <div>Contrato não encontrado.</div>;

  const contratoAtivo = contrato.status === "ATIVO";
  const podeMexer = podeEditar && contratoAtivo;
  const noivaNome = contrato.lead?.noivaNome;

  const onCancelar = async () => {
    if (!motivo.trim()) {
      toast({ title: "Informe o motivo do cancelamento", variant: "destructive" });
      return;
    }
    try {
      await cancelar.mutateAsync({
        lojaId: activeLojaId!,
        contratoId: id!,
        data: { motivo: motivo.trim(), destinoPago },
      });
      await Promise.all([
        invalidarParcelas(),
        queryClient.invalidateQueries({ queryKey: getListContratosQueryKey(activeLojaId!) }),
      ]);
      toast({
        title: "Contrato cancelado",
        description:
          destinoPago === "estornar"
            ? "Parcelas previstas canceladas e valores pagos estornados do caixa."
            : "Parcelas previstas canceladas; o que já foi pago fica no caixa.",
      });
      setCancelarOpen(false);
    } catch (err) {
      toast({
        title: "Erro ao cancelar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const onGerarPlano = async () => {
    const entradaValor = parseValor(entrada);
    if (entradaValor !== null && (Number.isNaN(entradaValor) || entradaValor < 0)) {
      toast({ title: "Entrada inválida", variant: "destructive" });
      return;
    }
    const n = Number(numParcelas);
    if (!Number.isInteger(n) || n < 1 || n > 360) {
      toast({ title: "Número de parcelas inválido (1 a 360)", variant: "destructive" });
      return;
    }
    if (!primeiroVencimento) {
      toast({ title: "Informe o primeiro vencimento", variant: "destructive" });
      return;
    }
    const periodicidade = Number(periodicidadeDias);
    if (!Number.isInteger(periodicidade) || periodicidade < 1) {
      toast({ title: "Periodicidade inválida", variant: "destructive" });
      return;
    }
    try {
      await gerarPlano.mutateAsync({
        lojaId: activeLojaId!,
        contratoId: id!,
        data: {
          ...(entradaValor ? { entrada: entradaValor } : {}),
          numParcelas: n,
          primeiroVencimento: diaParaISO(primeiroVencimento),
          periodicidadeDias: periodicidade,
        },
      });
      await invalidarParcelas();
      toast({ title: "Plano de pagamento gerado" });
    } catch (err) {
      toast({
        title: "Erro ao gerar o plano",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const abrirReceber = (parcela: Parcela) => {
    setValorRecebido(parcela.valorPrevisto.toFixed(2).replace(".", ","));
    setFormaRecebimento("");
    setParcelaReceber(parcela);
  };

  const onReceber = async () => {
    if (!parcelaReceber) return;
    const valor = parseValor(valorRecebido);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      toast({ title: "Valor recebido inválido", variant: "destructive" });
      return;
    }
    try {
      await receber.mutateAsync({
        lojaId: activeLojaId!,
        parcelaId: parcelaReceber.id,
        data: {
          valorRecebido: valor,
          recebidoEm: new Date().toISOString(),
          ...(formaRecebimento ? { formaRecebimento } : {}),
        },
      });
      await invalidarParcelas();
      toast({ title: "Recebimento registrado" });
      setParcelaReceber(null);
    } catch (err) {
      toast({
        title: "Erro ao receber",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const onConfirmarAcaoParcela = async () => {
    if (!confirmacao) return;
    const { tipo, parcela } = confirmacao;
    try {
      if (tipo === "estornar") {
        await estornar.mutateAsync({ lojaId: activeLojaId!, parcelaId: parcela.id });
      } else {
        await remover.mutateAsync({ lojaId: activeLojaId!, parcelaId: parcela.id });
      }
      await invalidarParcelas();
      toast({ title: tipo === "estornar" ? "Recebimento estornado" : "Parcela removida" });
      setConfirmacao(null);
    } catch (err) {
      toast({
        title: tipo === "estornar" ? "Erro ao estornar" : "Erro ao remover",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const rotuloParcela = (p: Parcela) => (p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`);

  const statusParcela = (p: Parcela) => {
    if (p.status === "CANCELADA") return { rotulo: "Cancelada", variante: "outline" as const };
    if (p.status === "PAGA") {
      const forma = p.formaRecebimento ? ` (${rotuloForma(p.formaRecebimento)})` : "";
      return { rotulo: `Paga${forma}`, variante: "default" as const };
    }
    if (atrasada(p)) return { rotulo: "Atrasada", variante: "destructive" as const };
    return { rotulo: "Prevista", variante: "secondary" as const };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif">
            {noivaNome ? (
              <Link to={`/loja/${lojaId}/noivas/${contrato.leadId}`} className="hover:text-primary hover:underline">
                {noivaNome}
              </Link>
            ) : (
              `Contrato #${contrato.id.slice(0, 6)}`
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fechado em {new Date(contrato.fechadoEm).toLocaleDateString("pt-BR")}
            {contrato.dataCasamento && ` • Casamento ${new Date(contrato.dataCasamento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`}
            {contrato.vendedora && ` • Vendedora: ${contrato.vendedora.nome}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Âncora crua, e não o client gerado: o PDF é um download do navegador
              (cookie de sessão vai junto), sem passar pelo react-query. */}
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/lojas/${lojaId}/contratos/${contrato.id}/pdf`} target="_blank" rel="noreferrer">
              Baixar PDF
            </a>
          </Button>
          {contrato.orcamentoId && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/loja/${lojaId}/orcamentos/${contrato.orcamentoId}`}>Ver orçamento de origem</Link>
            </Button>
          )}
          <Badge variant={contratoAtivo ? 'default' : 'destructive'} className="text-sm px-3 py-1">
            {contrato.status}
          </Badge>
          {podeMexer && (
            <Button variant="outline" size="sm" onClick={() => setCancelarOpen(true)}>
              Cancelar contrato
            </Button>
          )}
        </div>
      </div>

      {contrato.status === "CANCELADO" && contrato.canceladoMotivo && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Contrato cancelado{contrato.canceladoEm && ` em ${new Date(contrato.canceladoEm).toLocaleDateString("pt-BR")}`}</AlertTitle>
          <AlertDescription>Motivo: {contrato.canceladoMotivo}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes Financeiros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-muted-foreground text-sm">Valor Total</span>
              <p className="text-2xl font-semibold text-primary">R$ {brl(contrato.valorTotal)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-sm">Forma de Pagamento Base</span>
              <p className="font-medium">
                {rotuloForma(contrato.formaPagamento) ?? "Não definida"}
              </p>
            </div>
            {contrato.cpf && (
              <div>
                <span className="text-muted-foreground text-sm">CPF Cliente</span>
                <p className="font-medium">{contrato.cpf}</p>
              </div>
            )}
            {contrato.vestidoDescricao && (
              <div>
                <span className="text-muted-foreground text-sm">Vestido</span>
                <p className="font-medium">{contrato.vestidoDescricao}</p>
              </div>
            )}
            {contrato.itens && contrato.itens.length > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">Itens contratados</span>
                <ul className="mt-1 space-y-1">
                  {contrato.itens.map((item) => (
                    <li key={item.id} className="flex justify-between text-sm">
                      <span>{item.quantidade}× {item.descricao}</span>
                      <span className="font-medium">R$ {brl(item.quantidade * item.valorUnitario)}</span>
                    </li>
                  ))}
                </ul>
                {/* Com desconto, itens (bruto) ≠ valor total (líquido). A linha
                    fecha a conta: subtotal − desconto = total. O abatimento é
                    bruto − total, então reconcilia sempre. */}
                {contrato.descontoTipo && (() => {
                  const brutoC = contrato.itens!.reduce((a, it) => a + centavos(it.valorUnitario) * it.quantidade, 0);
                  const abatimentoC = brutoC - centavos(contrato.valorTotal);
                  const rotulo = contrato.descontoTipo === "PERCENTUAL" ? ` (${contrato.descontoValor}%)` : "";
                  return (
                    <div className="mt-2 space-y-1 border-t pt-2 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>R$ {brl(reais(brutoC))}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Desconto{rotulo}</span>
                        <span>− R$ {brl(reais(abatimentoC))}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plano de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {parcelas.length > 0 ? (
              <div className="space-y-3">
                <ul className="space-y-3">
                  {parcelas.map((parcela) => {
                    const st = statusParcela(parcela);
                    return (
                      <li key={parcela.id} className="border-b pb-2 last:border-0 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className={`font-medium text-sm ${parcela.status === "CANCELADA" ? "text-muted-foreground line-through" : ""}`}>
                              {rotuloParcela(parcela)}
                            </p>
                            <p className={`text-xs ${atrasada(parcela) ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              Venc: {new Date(parcela.vencimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold text-sm ${atrasada(parcela) ? "text-destructive" : ""}`}>
                              R$ {brl(parcela.valorPrevisto)}
                            </p>
                            <Badge variant={st.variante} className="text-[10px]">
                              {st.rotulo}
                            </Badge>
                          </div>
                        </div>
                        {podeMexer && parcela.status === "PREVISTA" && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => abrirReceber(parcela)}>
                              Receber
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setConfirmacao({ tipo: "remover", parcela })}
                            >
                              Remover
                            </Button>
                          </div>
                        )}
                        {podeEditar && parcela.status === "PAGA" && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setConfirmacao({ tipo: "estornar", parcela })}>
                              Estornar
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Total do plano</span>
                  <span className={`font-semibold text-sm ${planoDivergente ? "text-destructive" : ""}`}>
                    R$ {brl(reais(totalPlanoCentavos))}
                  </span>
                </div>
                {planoDivergente && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      O total do plano difere do valor total do contrato (R$ {brl(contrato.valorTotal)}).
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : podeMexer ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  Nenhuma parcela registrada. Gere o plano de pagamento do contrato.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="plano-entrada">Entrada (opcional)</Label>
                    <Input
                      id="plano-entrada"
                      placeholder="0,00"
                      value={entrada}
                      onChange={(e) => setEntrada(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plano-parcelas">Nº de parcelas</Label>
                    <Input
                      id="plano-parcelas"
                      type="number"
                      min={1}
                      max={360}
                      value={numParcelas}
                      onChange={(e) => setNumParcelas(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plano-vencimento">1º vencimento *</Label>
                    <Input
                      id="plano-vencimento"
                      type="date"
                      required
                      value={primeiroVencimento}
                      onChange={(e) => setPrimeiroVencimento(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plano-periodicidade">A cada (dias)</Label>
                    <Input
                      id="plano-periodicidade"
                      type="number"
                      min={1}
                      value={periodicidadeDias}
                      onChange={(e) => setPeriodicidadeDias(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={onGerarPlano} disabled={gerarPlano.isPending}>
                  {gerarPlano.isPending ? "Gerando…" : "Gerar plano"}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma parcela registrada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancelamento do contrato */}
      <Dialog open={cancelarOpen} onOpenChange={setCancelarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              As parcelas em aberto serão anuladas e o vestido será liberado. Sobre o que já foi recebido:
            </p>
            <RadioGroup value={destinoPago} onValueChange={(v) => setDestinoPago(v as "manter" | "estornar")}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manter" id="destino-manter" />
                <Label htmlFor="destino-manter" className="font-normal">
                  A noiva perdeu o sinal — mantém no caixa
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="estornar" id="destino-estornar" />
                <Label htmlFor="destino-estornar" className="font-normal">
                  Devolvi o valor — estorna do caixa
                </Label>
              </div>
            </RadioGroup>
            <Textarea
              placeholder="Motivo do cancelamento *"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarOpen(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={onCancelar} disabled={cancelar.isPending}>
              {cancelar.isPending ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receber parcela */}
      <Dialog open={!!parcelaReceber} onOpenChange={(open) => !open && setParcelaReceber(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Receber {parcelaReceber ? rotuloParcela(parcelaReceber).toLowerCase() : "parcela"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="receber-valor">Valor recebido</Label>
              <Input
                id="receber-valor"
                placeholder="0,00"
                value={valorRecebido}
                onChange={(e) => setValorRecebido(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de recebimento</Label>
              {/* O Select devolve string; as opções saem das chaves de ROTULO_FORMA,
                  que o próprio tipo do mapa mantém alinhadas com o enum da API. */}
              <Select
                value={formaRecebimento}
                onValueChange={(v) => setFormaRecebimento(v as ReceberParcelaInputFormaRecebimento)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Forma…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROTULO_FORMA).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>
                      {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParcelaReceber(null)}>
              Voltar
            </Button>
            <Button onClick={onReceber} disabled={receber.isPending}>
              {receber.isPending ? "Registrando…" : "Registrar recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de remover/estornar parcela */}
      <AlertDialog open={!!confirmacao} onOpenChange={(open) => !open && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.tipo === "estornar" ? "Estornar recebimento?" : "Remover parcela?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.tipo === "estornar"
                ? `O recebimento de ${confirmacao ? rotuloParcela(confirmacao.parcela) : ""} (R$ ${confirmacao ? brl(confirmacao.parcela.valorPrevisto) : ""}) será desfeito e a parcela volta a ficar em aberto.`
                : `${confirmacao ? rotuloParcela(confirmacao.parcela) : ""} (R$ ${confirmacao ? brl(confirmacao.parcela.valorPrevisto) : ""}) será removida do plano. Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmarAcaoParcela}
              disabled={estornar.isPending || remover.isPending}
            >
              {confirmacao?.tipo === "estornar" ? "Estornar" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
