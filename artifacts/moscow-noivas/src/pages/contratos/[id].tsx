import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetContrato,
  getGetContratoQueryKey,
  useCancelarContrato,
  getListContratosQueryKey,
  useGerarPlanoParcelas,
  useEstornarParcela,
  useRemoveParcela,
  useListRecibos,
  getListRecibosQueryKey,
  type Parcela,
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
import { fraseEstornoParcela, fraseRemocaoParcela } from "@/lib/financeiro/confirmacoes";
import { recibosPorParcela } from "@/lib/recibos-da-parcela";
import { DialogoReceberParcela, rotuloParcela } from "@/components/dialogo-receber-parcela";
import {
  rotuloForma,
  estaAtrasada,
  estaAberta,
  saldoAberto,
  abertoEmCentavos,
  teveRecebimento,
  podeRemoverParcela,
  motivoNaoRemove,
} from "@/lib/financeiro/forma";
import { hojeLocal } from "@/lib/financeiro/datas";
import { mensagemApi } from "@/lib/erro-api";
// E95: o `parseValor` desta tela era uma QUARTA cópia da mesma função, letra
// por letra igual à do core. Não estava no backlog do C3 — apareceu ao adotar
// a régua na tela de orçamento, e cópia de leitura de dinheiro é a classe de
// defeito que o épico existe para fechar.
import { brutoEmCentavos, centavos, linhaDeDesconto, parseValor, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import {
  planoDaDigitacao,
  temCarne,
  totalDoCarneCentavos,
  faltanteDoCarneCentavos,
} from "@/lib/financeiro/plano";
// E218 — a reserva de 40% da cláusula 8ª §1º: a tela sugere e avisa, e quem
// decide continua sendo a loja.
import { avisoDeEntradaAbaixoDaReserva, entradaDaReserva } from "@/lib/financeiro/reserva";
import { PreviaDoCarne } from "@/components/previa-do-carne";
import { invalidarCaixa } from "@/pages/financeiro/helpers";
import { podeNoModulo } from "@/lib/permissoes";

const MENSAGENS_ERRO: Record<string, string> = {
  JA_TEM_PLANO: "Este contrato já tem um plano de pagamento.",
  // P7/E169: completar o carnê é gesto próprio, e a entrada não cabe nele.
  ENTRADA_NO_COMPLEMENTO:
    "A entrada só existe quando o carnê nasce — para completar o que falta, deixe a entrada em branco.",
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

  // Confirmação de remover/estornar
  const [confirmacao, setConfirmacao] = useState<{ tipo: "remover" | "estornar"; parcela: Parcela } | null>(null);

  const { data: contrato, isLoading, isError, refetch } = useGetContrato(activeLojaId!, id!, {
    query: { queryKey: getGetContratoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });

  const cancelar = useCancelarContrato();
  const gerarPlano = useGerarPlanoParcelas();
  const estornar = useEstornarParcela();
  const remover = useRemoveParcela();
  // E172: o módulo é `contratos`, não mais `leads` — contrato e parcela saíram
  // da carteira de noivas e ganharam módulo próprio (`lib/permissoes.ts:21`).
  const podeEditar = podeNoModulo(acessosModulos, "contratos", "editar");
  // E115 — gerar o plano é CRIAR parcelas, e o servidor cobra exatamente isso
  // (decisão escrita no E111: "criar parcela É criar"). O gate era `editar`:
  // a gerente sem `criar` via o formulário e levava 403 ao clicar, e quem tem
  // `criar` sem `editar` não via um formulário que o servidor aceitaria.
  const podeCriarParcela = podeNoModulo(acessosModulos, "contratos", "criar");

  const parcelas = useMemo(
    () => [...(contrato?.parcelas ?? [])].sort((a, b) => a.numero - b.numero),
    [contrato?.parcelas],
  );

  /**
   * E221 — os recibos da cláusula 7ª. A loja também precisa CONSEGUIR emitir:
   * a noiva liga pedindo o comprovante do Pix de março, e sem isto a vendedora
   * não tem o que mandar.
   *
   * Um por RECEBIMENTO, então uma parcela recebida em três vezes tem três
   * links — e é isso que a tela diz, em vez de fingir que houve um pagamento
   * só de R$ 1.000,00 no dia do último.
   */
  const { data: dadosRecibos } = useListRecibos(activeLojaId!, id!, {
    query: { queryKey: getListRecibosQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id },
  });
  const recibosDa = useMemo(
    () => recibosPorParcela(dadosRecibos?.recibos ?? []),
    [dadosRecibos?.recibos],
  );
  // S-M19: a pergunta do servidor (`origem === PLANO`), não `length > 0` — a
  // parcela de avaria cobrada antes do carnê não pode esconder o "Gerar plano".
  const contratoTemCarne = temCarne(parcelas);
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
      // E125/D4: a soma do aberto é a régua única do core — a MESMA do
      // "falta pagar" do portal da noiva e do "Falta receber" ali de cima.
      aberto: reais(abertoEmCentavos(parcelas)),
    };
  }, [parcelas]);

  /**
   * P8/E169 — o "Total do plano" e o alerta que ele acende falam do CARNÊ.
   *
   * A soma era de toda parcela não-CANCELADA, e a parcela de avaria
   * (`origem: AVARIA`) entra nela por construção: num contrato de R$ 5.000,00
   * com um reparo de R$ 350,00, o total do plano dava **R$ 5.350,00** e o
   * alerta vermelho acendia sobre um estado que o servidor considera
   * perfeitamente correto. O alarme que existe para denunciar carnê corrompido
   * tocava em todo contrato com avaria — e por isso deixaria de ser lido
   * justamente quando a divergência fosse verdadeira.
   *
   * É a mesma separação do papel (P12/E165): o carnê de um lado, as cobranças
   * fora do valor total do outro, cada um com o próprio subtotal.
   */
  const totalCarneCentavos = useMemo(() => totalDoCarneCentavos(parcelas), [parcelas]);
  const foraDoCarne = useMemo(
    () => parcelas.filter((p) => p.origem !== "PLANO" && p.status !== "CANCELADA"),
    [parcelas],
  );
  const totalForaDoCarneCentavos = useMemo(
    () => somaCentavos(foraDoCarne, (p) => p.valorPrevisto),
    [foraDoCarne],
  );

  /**
   * S10 — o carnê à vista ANTES de gerar, como a tela de orçamento (F16/E95).
   *
   * Esta tela gerava o plano às cegas: três campos, um botão, e o carnê só
   * aparecia depois de gravado. A prévia é a MESMA função e o MESMO componente
   * da tela irmã — `planoDaDigitacao` valida o que está digitado e monta as
   * linhas com o `montarPlanoParcelas` do core, que é exatamente o que o
   * `gerar-plano` executa no servidor (routes/contratos.ts), inclusive o
   * default da entrada vencer hoje.
   */
  /**
   * P7/E169 — quanto falta no carnê. Removida a parcela 10 de R$ 500,00 de um
   * carnê de R$ 5.000,00, o plano soma R$ 4.500,00, `temCarne` segue verdadeiro
   * e o formulário sumia para sempre: **não havia gesto nenhum na aplicação que
   * devolvesse aqueles R$ 500,00** — o servidor respondia 409 JA_TEM_PLANO. Ele
   * agora aceita completar, e é este número que a tela divide.
   */
  const faltanteCarneCentavos = contrato
    ? faltanteDoCarneCentavos(parcelas, centavos(contrato.valorTotal))
    : 0;
  const completandoCarne = faltanteCarneCentavos > 0;

  const previaDoPlano = useMemo(
    () =>
      planoDaDigitacao({
        // Completando, o que se divide é o BURACO — a prévia mostra o mesmo
        // carnê que o servidor vai gravar, como a régua S10 manda.
        totalCentavos: completandoCarne ? faltanteCarneCentavos : contrato ? centavos(contrato.valorTotal) : 0,
        entradaDigitada: completandoCarne ? "" : entrada,
        numParcelasDigitado: numParcelas,
        primeiroVencimento,
        vencimentoEntrada: hojeLocal(),
      }),
    [contrato, entrada, numParcelas, primeiroVencimento, completandoCarne, faltanteCarneCentavos],
  );
  const planoDivergente =
    contratoTemCarne && contrato != null && totalCarneCentavos !== centavos(contrato.valorTotal);

  /**
   * **E218 — a reserva de 40% da cláusula 8ª §1º**, avisada e não imposta.
   *
   * A conta vem do `financeiro-core`, a mesma que o teste prega — a tela não a
   * refaz (lição do E187, cinco grafias da mesma conta de desconto). Só aparece
   * quando há entrada DIGITADA: sugerir os 40% no placeholder de um campo em
   * branco já é o recado, e um aviso permanente sobre campo vazio vira ruído
   * que a vendedora aprende a ignorar.
   */
  const avisoDaEntrada = useMemo(() => {
    const valor = parseValor(entrada);
    if (completandoCarne || contrato == null || valor === null || Number.isNaN(valor)) return null;
    return avisoDeEntradaAbaixoDaReserva(valor, Number(contrato.valorTotal));
  }, [entrada, contrato, completandoCarne]);

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
      // E221: receber e estornar CRIAM e APAGAM recibo. `chavesDoCaixa` é por
      // loja e esta lista é por contrato, então ela entra aqui — sem isto o
      // link do recibo estornado continuaria na tela, e clicar nele daria 404.
      queryClient.invalidateQueries({ queryKey: getListRecibosQueryKey(activeLojaId!, id!) }),
      invalidarCaixa(queryClient, activeLojaId!),
    ]);

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Não deu para carregar o contrato</AlertTitle>
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
  // S-O66/E187: os itens numa CONST, e a estreita atravessa o `(() => …)()` do
  // subtotal — que era o único sítio das telas a AFIRMAR e passar adiante.
  const itensDoContrato = contrato.itens ?? [];

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
        title: "Não deu para cancelar",
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
          // P7: completar o carnê nunca cria entrada — `numero === 0` significa
          // ENTRADA em seis pontos do sistema, e a do contrato já foi combinada
          // quando o carnê nasceu. O servidor recusa com ENTRADA_NO_COMPLEMENTO.
          ...(entradaValor && !completandoCarne ? { entrada: entradaValor } : {}),
          numParcelas: n,
          // E95: a data é a da PARCELA 1. Antes esta rota a usava como data da
          // ENTRADA quando havia entrada, e a parcela 1 caía 30 dias depois —
          // o mesmo campo com dois sentidos, e nenhum deles era o do rótulo.
          primeiroVencimento: diaParaISO(primeiroVencimento),
        },
      });
      await invalidarParcelas();
      toast({ title: completandoCarne ? "Carnê completado" : "Plano de pagamento gerado" });
    } catch (err) {
      toast({
        title: "Não deu para gerar o plano",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  /**
   * S-M20: o diálogo de receber é UM — `components/dialogo-receber-parcela`,
   * o do F28/E98/E136. A cópia local desta página divergiu em três pontos
   * medidos pela rodada 2 (achado 7#1, 🟠): carimbava `recebidoEm = agora`
   * SEMPRE (o Pix de sábado lançado na segunda datava o caixa de segunda),
   * não tinha o `<form>` do E136 e reescrevia `rotuloParcela`.
   */
  const abrirReceber = (parcela: Parcela) => setParcelaReceber(parcela);

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
        title: tipo === "estornar" ? "Não deu para estornar" : "Não deu para remover",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

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
              <span className="text-muted-foreground text-sm">Valor total</span>
              {/* E8: era `text-primary`. Lado a lado com o `text-destructive` da parcela
                  em atraso, o rosa da marca lia-se como um segundo alerta. O rosa fica
                  para o que é INTERATIVO; aqui é o número mais importante da tela, e o
                  que ele precisa é de TAMANHO. */}
              <p className="money-lg">{brl(contrato.valorTotal)}</p>
            </div>
            {/* E125/D4: "quanto falta pagar?" é a pergunta do telefone, e a
                soma só existia DENTRO do diálogo de cancelar — a vendedora
                abria o diálogo só para LER o número, ou somava 7 parcelas de
                cabeça. É a mesma derivação do diálogo (uma conta só). */}
            {contratoAtivo && parcelas.length > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">Falta receber</span>
                <p className="money-md" data-testid="text-falta-receber">
                  {brl(oQueSeraDesfeito.aberto)}
                </p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground text-sm">Forma de pagamento base</span>
              <p className="font-medium">
                {rotuloForma(contrato.formaPagamento) ?? "Não definida"}
              </p>
            </div>
            {contrato.cpf && (
              <div>
                <span className="text-muted-foreground text-sm">CPF da noiva</span>
                <p className="font-medium">{contrato.cpf}</p>
              </div>
            )}
            {contrato.vestidoDescricao && (
              <div>
                <span className="text-muted-foreground text-sm">Vestido</span>
                <p className="font-medium">{contrato.vestidoDescricao}</p>
              </div>
            )}
            {/* S-O66/E187: `itens` sai da consulta para uma CONST antes do
                `length > 0`. A asserção que estava logo abaixo
                (`brutoEmCentavos(contrato.itens!)`) existia porque o TypeScript
                não leva a estreita de uma PROPRIEDADE para dentro da função
                que soma — e ela não é a mesma classe da S-O16: aquela afirma e
                desreferencia na hora, esta afirma e PASSA ADIANTE. Sem itens,
                a soma seria de `undefined`. Com a const, a estreita atravessa
                o `(() => …)()` e o `!` some. */}
            {itensDoContrato.length > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">Itens contratados</span>
                <ul className="mt-1 space-y-1">
                  {itensDoContrato.map((item) => (
                    <li key={item.id} className="flex justify-between text-sm">
                      <span>{item.quantidade}× {item.descricao}</span>
                      <span className="font-medium">{brl(item.quantidade * item.valorUnitario)}</span>
                    </li>
                  ))}
                </ul>
                {/* Com desconto, itens (bruto) ≠ valor total (líquido). A linha
                    fecha a conta: subtotal − desconto = total. O abatimento é
                    bruto − total, então reconcilia sempre. */}
                {/* P15/E163: a régua única — tipo com valor 0 é SEM desconto,
                    como o dinheiro sempre tratou; a tela desenhava o bloco.
                    S-O64/E187: a subtração era escrita aqui, e o portal da
                    noiva mostrava o MESMO contrato pelo `descontoValor` cru.
                    `linhaDeDesconto` é a régua das cinco telas, e o
                    `brutoEmCentavos` do core (E95/C1) segue sendo quem soma. */}
                {(() => {
                  const desc = linhaDeDesconto(
                    brutoEmCentavos(itensDoContrato),
                    centavos(contrato.valorTotal),
                    contrato.descontoTipo,
                    contrato.descontoValor,
                  );
                  if (!desc) return null;
                  return (
                    <div className="mt-2 space-y-1 border-t pt-2 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{brl(reais(desc.subtotalC))}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Desconto{desc.rotulo}</span>
                        <span>− {brl(reais(desc.abatimentoC))}</span>
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
            {parcelas.length > 0 && (
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
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => abrirReceber(parcela)}>
                              {parcela.status === "PARCIAL" ? "Receber o restante" : "Receber"}
                            </Button>
                            {/* P6/E169: "aberta" decide quem se RECEBE; quem se
                                REMOVE é `podeRemoverParcela`, a régua do
                                servidor. Em PARCIAL o botão levava a um 422
                                cuja frase — "Só parcelas em aberto podem ser
                                removidas" — se contradizia sobre uma parcela
                                que ESTÁ em aberto, e não havia gesto possível.
                                No lugar dele, o gesto que existe. */}
                            {podeRemoverParcela(parcela) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setConfirmacao({ tipo: "remover", parcela })}
                              >
                                Remover
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground" data-testid="motivo-nao-remove">
                                {motivoNaoRemove(parcela)}
                              </span>
                            )}
                          </div>
                        )}
                        {/* E221 — a cláusula 7ª: "a LOCADORA deverá fornecer
                            todos os recibos de pagamentos EFETUADOS". Um link
                            por RECEBIMENTO, com o valor e o dia DAQUELE
                            pagamento — a parcela recebida em duas vezes tem
                            dois papéis, e o de março não pode sair datado de
                            abril. Âncora crua e não o client gerado: é um
                            download do navegador, como o "Baixar PDF". */}
                        {(recibosDa.get(parcela.id) ?? []).length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-xs text-muted-foreground">Recibos:</span>
                            {(recibosDa.get(parcela.id) ?? []).map((r) => (
                              <a
                                key={r.id}
                                href={`/api/lojas/${lojaId}/contratos/${contrato.id}/recibos/${r.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                                data-testid="recibo-da-parcela"
                                className="text-xs underline underline-offset-2 tabular-nums"
                              >
                                {brl(r.valor)} · {diaMesAno(r.pagoEm)}
                              </a>
                            ))}
                          </div>
                        )}
                        {/* E115: `teveRecebimento` agora vê a CANCELADA que
                            guardou dinheiro ('manter') — mas estorná-la o
                            servidor recusa (contrato não está ativo), então o
                            botão só existe com o contrato de pé. */}
                        {podeMexer && teveRecebimento(parcela) && (
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
                {contratoTemCarne && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Total do carnê</span>
                    <span className={`font-semibold text-sm ${planoDivergente ? "text-destructive" : ""}`}>
                      {brl(reais(totalCarneCentavos))}
                    </span>
                  </div>
                )}
                {/* P8: as cobranças que NÃO são o carnê ganham subtotal próprio,
                    como no papel (P12/E165) — elas não entram no valor total do
                    contrato e não têm por que fazer o alerta acender. */}
                {foraDoCarne.length > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Cobranças fora do carnê
                    </span>
                    <span className="text-sm text-muted-foreground" data-testid="total-fora-do-carne">
                      {brl(reais(totalForaDoCarneCentavos))}
                    </span>
                  </div>
                )}
                {planoDivergente && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      O carnê soma {brl(reais(totalCarneCentavos))} e o contrato é de{" "}
                      {brl(contrato.valorTotal)}.
                      {faltanteCarneCentavos > 0 &&
                        ` Faltam ${brl(reais(faltanteCarneCentavos))} — gere as parcelas que completam o carnê aqui embaixo.`}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            {/* S-M19: o formulário existe enquanto NÃO houver carnê (origem
                PLANO) — não enquanto não houver parcela nenhuma. A avaria
                cobrada antes do carnê aparece na lista acima E o plano ainda
                se gera. */}
            {/* P7/E169: e o formulário também reabre quando o carnê PERDEU
                uma parcela — era esse o beco sem saída. */}
            {(!contratoTemCarne || completandoCarne) && podeCriarParcela && contratoAtivo ? (
              /* E136/E6: Enter conclui o plano — era o único fluxo de dinheiro
                 desta tela e não tinha <form>. */
              <form
                className={parcelas.length > 0 ? "space-y-3 border-t pt-4 mt-4" : "space-y-3"}
                onSubmit={(e) => {
                  e.preventDefault();
                  void onGerarPlano();
                }}
              >
                <p className="text-muted-foreground text-sm" data-testid="texto-gerar-plano">
                  {completandoCarne
                    ? `Faltam ${brl(reais(faltanteCarneCentavos))} no carnê deste contrato — gere as parcelas que completam o valor.`
                    : parcelas.length > 0
                      ? "As parcelas acima não são o carnê do contrato. Gere o plano de pagamento."
                      : "Nenhuma parcela registrada. Gere o plano de pagamento do contrato."}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* P7: completando não há entrada — ela pertence ao carnê que
                      já nasceu, e o servidor recusa (ENTRADA_NO_COMPLEMENTO). */}
                  {!completandoCarne && (
                    <div className="space-y-1.5">
                      <Label htmlFor="plano-entrada">Entrada (opcional)</Label>
                      {/* E218 — o placeholder é a sugestão da cláusula 8ª §1º:
                          40% do total. Ele NÃO preenche o campo, porque a
                          entrada continua opcional e quem negocia é a loja —
                          mas quem não sabe do percentual passa a ver o número
                          que o contrato pede, no lugar onde ele é digitado. */}
                      <Input
                        id="plano-entrada"
                        inputMode="decimal"
                        placeholder={brl(entradaDaReserva(Number(contrato?.valorTotal ?? 0)))}
                        value={entrada}
                        onChange={(e) => setEntrada(e.target.value)}
                      />
                      {/* E218 — e o aviso, quando a entrada digitada fica
                          abaixo. Medido antes de escrever: 101 dos 208
                          contratos com entrada estão abaixo dos 40%, e a média
                          é 67,6% — recusar tornaria quase metade do que a loja
                          já fez irreproduzível pela porta. Então avisa e deixa
                          passar: a frase diz isso na última linha. */}
                      {avisoDaEntrada && (
                        <p className="text-xs text-amber-600" data-testid="aviso-entrada-reserva">
                          {avisoDaEntrada.aviso}
                        </p>
                      )}
                    </div>
                  )}
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

                {/* S10: o mesmo carnê que o servidor vai gravar, linha a linha,
                    enquanto se digita — como no "Gerar contrato" da tela irmã. */}
                <PreviaDoCarne erro={previaDoPlano.erro} linhas={previaDoPlano.linhas} />

                <Button type="submit" disabled={gerarPlano.isPending}>
                  {gerarPlano.isPending
                    ? "Gerando…"
                    : completandoCarne
                      ? "Completar carnê"
                      : "Gerar plano"}
                </Button>
              </form>
            ) : parcelas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma parcela registrada.</p>
            ) : null}
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
              placeholder="Motivo do cancelamento"
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

      {/* Receber parcela — o diálogo compartilhado (S-M20): campo de data com
          a régua hoje-vs-dia-passado, <form> do E136 e as frases de erro do
          B6. O gancho `aoReceber` recarrega o GET do contrato, que é a única
          coisa desta tela que o `invalidarCaixa` do diálogo não cobre. */}
      <DialogoReceberParcela
        lojaId={activeLojaId!}
        parcela={parcelaReceber}
        onFechar={() => setParcelaReceber(null)}
        aoReceber={() =>
          Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetContratoQueryKey(activeLojaId!, id!) }),
            // E221: o recibo nasce do recebimento, então o link tem de aparecer
            // sem recarregar a página — é o comprovante que a noiva pede agora.
            queryClient.invalidateQueries({ queryKey: getListRecibosQueryKey(activeLojaId!, id!) }),
          ])
        }
      />

      {/* Confirmação de remover/estornar parcela */}
      <AlertDialog open={!!confirmacao} onOpenChange={(open) => !open && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.tipo === "estornar" ? "Estornar recebimento?" : "Remover parcela?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {/* E128/C5: o estorno citava o PREVISTO onde o caixa perde o
                  RECEBIDO — parcela de R$ 1.000,00 com R$ 300,00 recebidos, o
                  diálogo dizia desfazer R$ 1.000,00. A frase (e o número que
                  ela cita) é decisão pura em lib/financeiro/confirmacoes. */}
              {/* P7/E169: removida uma parcela do CARNÊ, a frase diz o buraco
                  que fica e onde ele se tapa — "não pode ser desfeita" tinha
                  virado mentira agora que o gerar-plano completa. */}
              {confirmacao &&
                (confirmacao.tipo === "estornar"
                  ? fraseEstornoParcela(rotuloParcela(confirmacao.parcela), confirmacao.parcela)
                  : fraseRemocaoParcela(rotuloParcela(confirmacao.parcela), confirmacao.parcela, {
                      somaDepoisCentavos:
                        totalCarneCentavos - centavos(confirmacao.parcela.valorPrevisto),
                      totalContratoCentavos: centavos(contrato.valorTotal),
                    }))}
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
