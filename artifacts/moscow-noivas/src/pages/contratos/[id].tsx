import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetContrato,
  getGetContratoQueryKey,
  useCancelarContrato,
  getListContratosQueryKey,
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
import { NaoEncontrado } from "@/components/estado";
import { CabecalhoDetalhe } from "@/components/cabecalho-detalhe";
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
import { brl, diaParaISO, statusContratoLabel, instanteDia, diaMesAno } from "@/lib/formatos";
import {
  ROTULO_FORMA,
  rotuloForma,
  estaAtrasada,
  estaAberta,
  saldoAberto,
  teveRecebimento,
} from "@/lib/financeiro/forma";
import { hojeLocal } from "@/lib/financeiro/datas";
import { mensagemApi } from "@/lib/erro-api";
// E95: o `parseValor` desta tela era uma QUARTA cópia da mesma função, letra
// por letra igual à do core. Não estava no backlog do C3 — apareceu ao adotar
// a régua na tela de orçamento, e cópia de leitura de dinheiro é a classe de
// defeito que o épico existe para fechar.
import { brutoEmCentavos, centavos, parseValor, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { invalidarCaixa } from "@/pages/financeiro/helpers";
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
  // B6/E94 — ver o comentário em financeiro/receber.tsx: as duas telas recebem
  // pela mesma rota, então as duas precisam saber traduzir o 409.
  PARCELA_MUDOU: "Alguém acabou de receber nesta parcela — confira o valor e lance de novo.",
};

// E96: aqui vivia uma CÓPIA LOCAL do `mensagemApi`, e ela era a única tela que
// não adotou a função do E92 — cinco outras (folha, pagar, receber, comissões,
// trocar-senha) já a importam passando o dicionário local, que é o desenho
// certo: função uma, dicionário de cada tela. A cópia ainda tinha a perna que o
// E92 matou (`return err.message`), então esta tela seguia capaz de mostrar
// "HTTP 422 Unprocessable Entity" na cara de quem recebe dinheiro.
//
// O backlog do E96 apontava este arquivo como a REFERÊNCIA a copiar. O que ele
// tinha de bom era o dicionário; a função era o desvio.

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

  /**
   * F33/E94 — o que o cancelamento vai desfazer, calculado ANTES de ele
   * acontecer.
   *
   * O diálogo pedia uma decisão de dinheiro ("mantém no caixa" ou "estorna")
   * sem mostrar dinheiro nenhum: dois rótulos genéricos e um campo de motivo. A
   * pessoa escolhia entre duas frases sem saber que havia R$ 2.000 recebidos em
   * 12/06, nem que sobravam R$ 8.000 a cobrar. Os dados sempre estiveram em
   * mãos — `contrato.parcelas` traz `valorRecebido` e `recebidoEm` de cada uma;
   * só não eram lidos aqui.
   */
  const oQueSeraDesfeito = useMemo(() => {
    const comRecebimento = parcelas.filter((p) => (p.valorRecebido ?? 0) > 0);
    const abertas = parcelas.filter((p) => estaAberta(p));
    return {
      comRecebimento,
      recebido: reais(somaCentavos(comRecebimento, (p) => p.valorRecebido ?? 0)),
      abertas: abertas.length,
      aberto: reais(somaCentavos(abertas, (p) => saldoAberto(p))),
    };
  }, [parcelas]);

  const totalPlanoCentavos = useMemo(
    () => somaCentavos(parcelas.filter((p) => p.status !== "CANCELADA"), (p) => p.valorPrevisto),
    [parcelas],
  );
  const planoDivergente =
    parcelas.length > 0 && contrato != null && totalPlanoCentavos !== centavos(contrato.valorTotal);

  /**
   * Receber, estornar, remover parcela e cancelar contrato são MOVIMENTO DE
   * CAIXA, e a régua deles é `chavesDoCaixa` (D9/E93) — não a lista desta tela.
   *
   * Esta função invalidava só o contrato e as parcelas. O diálogo de receber
   * foi migrado para `invalidarCaixa`; este segundo call-site do MESMO endpoint
   * ficou para trás: recebida a entrada de R$ 5.000 pelo botão da linha da
   * parcela, o DRE e o Fluxo continuavam mostrando a receita sem ela, e o sino
   * do layout — montado em toda tela — seguia avisando que o caixa fura na data
   * antiga. `chavesDoCaixa` já inclui a lista de parcelas.
   */
  const invalidarParcelas = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetContratoQueryKey(activeLojaId!, id!) }),
      invalidarCaixa(queryClient, activeLojaId!),
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
  if (!contrato) {
    return (
      <NaoEncontrado
        titulo="Este contrato não existe"
        voltarPara={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/loja/${lojaId}/contratos`}>Voltar aos contratos</Link>
          </Button>
        }
      />
    );
  }

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
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
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
    try {
      await gerarPlano.mutateAsync({
        lojaId: activeLojaId!,
        contratoId: id!,
        data: {
          ...(entradaValor ? { entrada: entradaValor } : {}),
          numParcelas: n,
          // E95: a data é a da PARCELA 1. Antes esta rota a usava como data da
          // ENTRADA quando havia entrada, e a parcela 1 caía 30 dias depois —
          // o mesmo campo com dois sentidos, e nenhum deles era o do rótulo.
          primeiroVencimento: diaParaISO(primeiroVencimento),
        },
      });
      await invalidarParcelas();
      toast({ title: "Plano de pagamento gerado" });
    } catch (err) {
      toast({
        title: "Erro ao gerar o plano",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const abrirReceber = (parcela: Parcela) => {
    // O que FALTA, não o previsto: numa parcela meio recebida, sugerir o valor
    // cheio cobraria de novo o que já entrou.
    setValorRecebido(saldoAberto(parcela).toFixed(2).replace(".", ","));
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
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
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
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
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
    // Parcial atrasada é atrasada: o resto venceu igual (E49).
    if (p.status === "PARCIAL") {
      return atrasada(p)
        ? { rotulo: "Parcial · atrasada", variante: "destructive" as const }
        : { rotulo: "Parcial", variante: "secondary" as const };
    }
    if (atrasada(p)) return { rotulo: "Atrasada", variante: "destructive" as const };
    return { rotulo: "Prevista", variante: "secondary" as const };
  };

  return (
    <div className="space-y-6">
      {/* E9: o status saiu da fileira de botões (onde o Badge rosa "Ativo" era o
          elemento mais clicável dos três, sem ser clicável) e virou chip de
          leitura ao lado do nome. "Cancelar contrato" saiu do mesmo tamanho dos
          vizinhos para dentro do menu, em vermelho. */}
      <CabecalhoDetalhe
        trilha={[
          { rotulo: "Noivas", para: "/noivas" },
          ...(noivaNome && contrato.leadId
            ? [{ rotulo: noivaNome, para: `/noivas/${contrato.leadId}` }]
            : []),
          { rotulo: "Contrato" },
        ]}
        titulo={noivaNome ?? `Contrato #${contrato.id.slice(0, 6)}`}
        chip={
          <Badge variant={contratoAtivo ? "default" : "destructive"} className="text-sm px-3 py-1">
            {statusContratoLabel(contrato.status)}
          </Badge>
        }
        subtitulo={
          <>
            Fechado em {instanteDia(contrato.fechadoEm)}
            {contrato.dataCasamento && ` • Casamento ${diaMesAno(contrato.dataCasamento)}`}
            {contrato.vendedora && ` • Vendedora: ${contrato.vendedora.nome}`}
          </>
        }
        acaoPrimaria={
          /* Âncora crua, e não o client gerado: o PDF é um download do navegador
             (cookie de sessão vai junto), sem passar pelo react-query. */
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/lojas/${lojaId}/contratos/${contrato.id}/pdf`} target="_blank" rel="noreferrer">
              Baixar PDF
            </a>
          </Button>
        }
        acoes={[
          ...(contrato.orcamentoId
            ? [{ rotulo: "Ver orçamento de origem", para: `/orcamentos/${contrato.orcamentoId}` }]
            : []),
          ...(podeMexer
            ? [{ rotulo: "Cancelar contrato", onClick: () => setCancelarOpen(true), destrutiva: true }]
            : []),
        ]}
      />

      {contrato.status === "CANCELADO" && contrato.canceladoMotivo && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Contrato cancelado{contrato.canceladoEm && ` em ${instanteDia(contrato.canceladoEm)}`}</AlertTitle>
          <AlertDescription>Motivo: {contrato.canceladoMotivo}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes financeiros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-muted-foreground text-sm">Valor Total</span>
              {/* E8: era `text-primary`. Lado a lado com o `text-destructive` da parcela
                  em atraso, o rosa da marca lia-se como um segundo alerta. O rosa fica
                  para o que é INTERATIVO; aqui é o número mais importante da tela, e o
                  que ele precisa é de TAMANHO. */}
              <p className="money-lg">{brl(contrato.valorTotal)}</p>
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
                      <span className="font-medium">{brl(item.quantidade * item.valorUnitario)}</span>
                    </li>
                  ))}
                </ul>
                {/* Com desconto, itens (bruto) ≠ valor total (líquido). A linha
                    fecha a conta: subtotal − desconto = total. O abatimento é
                    bruto − total, então reconcilia sempre. */}
                {contrato.descontoTipo && (() => {
                  // `brutoEmCentavos` é a régua do core (E95/C1) — a mesma que
                  // o PDF do MESMO contrato usa. O `reduce` inline aqui era a
                  // terceira escrita da conta, e a tela e o papel divergirem
                  // sobre o subtotal é o defeito que a régua existe para impedir.
                  const brutoC = brutoEmCentavos(contrato.itens!);
                  const abatimentoC = brutoC - centavos(contrato.valorTotal);
                  const rotulo = contrato.descontoTipo === "PERCENTUAL" ? ` (${contrato.descontoValor}%)` : "";
                  return (
                    <div className="mt-2 space-y-1 border-t pt-2 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{brl(reais(brutoC))}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Desconto{rotulo}</span>
                        <span>− {brl(reais(abatimentoC))}</span>
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
            <CardTitle>Plano de pagamento</CardTitle>
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
                              Venc: {diaMesAno(parcela.vencimento)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold text-sm ${atrasada(parcela) ? "text-destructive" : ""}`}>
                              {brl(parcela.valorPrevisto)}
                            </p>
                            {parcela.status === "PARCIAL" && (
                              <p className="text-[10px] text-muted-foreground tabular-nums">
                                faltam {brl(saldoAberto(parcela))}
                              </p>
                            )}
                            <Badge variant={st.variante} className="text-[10px]">
                              {st.rotulo}
                            </Badge>
                          </div>
                        </div>
                        {podeMexer && estaAberta(parcela) && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => abrirReceber(parcela)}>
                              {parcela.status === "PARCIAL" ? "Receber o restante" : "Receber"}
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
                        {podeEditar && teveRecebimento(parcela) && (
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
                    {brl(reais(totalPlanoCentavos))}
                  </span>
                </div>
                {planoDivergente && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      O total do plano difere do valor total do contrato ({brl(contrato.valorTotal)}).
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
                      inputMode="decimal"
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
                    <Label htmlFor="plano-vencimento">1ª parcela vence em *</Label>
                    <Input
                      id="plano-vencimento"
                      type="date"
                      required
                      value={primeiroVencimento}
                      onChange={(e) => setPrimeiroVencimento(e.target.value)}
                    />
                  </div>
                </div>
                {/* E95: o campo "A cada (dias)" saiu. Ele espaçava o carnê por
                    N dias corridos — o dia do vencimento andava para trás todo
                    mês e duas parcelas podiam cair na mesma competência. A
                    régua agora é mensal por dia fixo, a mesma que a tela de
                    orçamento sempre usou. */}
                <p className="text-muted-foreground text-sm">
                  As parcelas vencem todo mês no mesmo dia. Se o dia não existir no mês (31 em
                  fevereiro), a parcela cai no último dia dele. A entrada, se houver, vence hoje.
                </p>
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
              {oQueSeraDesfeito.abertas > 0 ? (
                <>
                  <strong className="text-foreground">
                    {oQueSeraDesfeito.abertas}{" "}
                    {oQueSeraDesfeito.abertas === 1 ? "parcela" : "parcelas"} em aberto,{" "}
                    {brl(oQueSeraDesfeito.aberto)}
                  </strong>{" "}
                  deixarão de ser cobradas, e o vestido será liberado.
                </>
              ) : (
                <>Não há parcelas em aberto. O vestido será liberado.</>
              )}
            </p>

            {/* F33: o que já entrou, item a item — a decisão abaixo é sobre ESTE
                dinheiro, e ela era pedida sem mostrá-lo. */}
            {oQueSeraDesfeito.comRecebimento.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2" data-testid="cancelar-recebido">
                <p className="text-sm font-medium">
                  Já recebido nesta venda: {brl(oQueSeraDesfeito.recebido)}
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {oQueSeraDesfeito.comRecebimento.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3">
                      <span>
                        {p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`}
                        {p.recebidoEm &&
                          ` — ${instanteDia(p.recebidoEm)}`}
                      </span>
                      <span className="tabular-nums">{brl(p.valorRecebido ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {oQueSeraDesfeito.comRecebimento.length > 0 && (
              <p className="text-sm text-muted-foreground">Sobre o que já foi recebido:</p>
            )}
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
                  Devolvi o valor — estorna {brl(oQueSeraDesfeito.recebido)} do caixa
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
                inputMode="decimal"
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
                ? `O recebimento de ${confirmacao ? rotuloParcela(confirmacao.parcela) : ""} (${confirmacao ? brl(confirmacao.parcela.valorPrevisto) : ""}) será desfeito e a parcela volta a ficar em aberto.`
                : `${confirmacao ? rotuloParcela(confirmacao.parcela) : ""} (${confirmacao ? brl(confirmacao.parcela.valorPrevisto) : ""}) será removida do plano. Esta ação não pode ser desfeita.`}
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
