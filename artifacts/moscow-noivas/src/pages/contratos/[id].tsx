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
  // E224 — o PRIMEIRO chamador de `PATCH /contratos/:id` no frontend. A porta
  // existe no spec desde sempre e nenhuma tela a usava: corrigir a retirada
  // digitada errada só era possível cancelando o contrato e fazendo outro.
  useUpdateContrato,
  useGetDisponibilidade,
  getGetDisponibilidadeQueryKey,
  // E226 — o gesto da 9ª: as rotas existiam desde o E213 com ZERO usos no
  // frontend, e o selo do perdão já era desenhado no portal. A tela sabia
  // mostrar o resultado de um gesto que ninguém podia fazer.
  usePerdoarMora,
  useRestabelecerMora,
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
import { brl, diaParaISO, statusContratoLabel, instanteDia, instanteCurto, diaMesAno } from "@/lib/formatos";
// E224 — as datas da locação (cláusulas 4ª e 5ª), com a régua da tela.
import {
  expedienteEmFrase,
  isoParaLocal,
  localParaISO,
  recusaDoExpediente,
} from "@/lib/retirada-devolucao";
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
// E226 — a mora da 9ª, do lado de quem lê: o número em negrito, a sugestão do
// diálogo e a régua do gesto de perdoar, numa grafia só (lição do E187).
import {
  moraEmAberto,
  podePerdoarMora,
  valorDaParcelaNaTela,
} from "@/lib/financeiro/mora-na-tela";
// S-C140 — a mesma régua que o servidor grava na trilha, para as duas pontas
// não divergirem sobre o que a cláusula manda reter (é o gesto do E187).
import { estornoContraARescisao } from "@workspace/financeiro-core";
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
  // E226 — a recusa da porta de perdoar: perdoar o que não é devido gravaria o
  // selo de uma dívida que nunca existiu.
  SEM_MORA: "Esta parcela não tem multa nem juros a perdoar.",
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
  // E227/S-C151 — quem rescinde (13ª). O campo existia na API desde o E217 e
  // nenhuma tela o oferecia: todo cancelamento saía como rescisão da NOIVA,
  // retendo o que a 13ª manda a loja devolver.
  const [iniciativa, setIniciativa] = useState<"LOCATARIA" | "LOJA">("LOCATARIA");

  // Gerar plano
  const [entrada, setEntrada] = useState("");
  const [numParcelas, setNumParcelas] = useState("1");
  const [primeiroVencimento, setPrimeiroVencimento] = useState("");

  // E224 — as datas da locação (cláusulas 4ª e 5ª)
  const [locacaoOpen, setLocacaoOpen] = useState(false);
  const [retiradaEditada, setRetiradaEditada] = useState("");
  const [devolucaoEditada, setDevolucaoEditada] = useState("");
  // E227/S-C211 — o prazo da 18ª (D3: pactuado por contrato). Sem ele
  // preenchido a cláusula não dispara — e estava em 0 de 743 contratos, por
  // falta de campo, não por decisão.
  const [prazoEditado, setPrazoEditado] = useState("");

  // Receber parcela
  const [parcelaReceber, setParcelaReceber] = useState<Parcela | null>(null);

  // E226 — perdoar a mora da 9ª. O motivo é obrigatório (grava NA parcela, e é
  // dele que o portal desenha o selo), então o gesto pede diálogo, não clique.
  const [parcelaPerdoar, setParcelaPerdoar] = useState<Parcela | null>(null);
  const [motivoPerdao, setMotivoPerdao] = useState("");

  // Confirmação de remover/estornar
  const [confirmacao, setConfirmacao] = useState<{ tipo: "remover" | "estornar"; parcela: Parcela } | null>(null);

  const { data: contrato, isLoading, isError, refetch } = useGetContrato(activeLojaId!, id!, {
    query: { queryKey: getGetContratoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });

  const cancelar = useCancelarContrato();
  const atualizarContrato = useUpdateContrato();
  /**
   * E224 — o expediente da 4ª, para a tela dizer a recusa antes de a porta
   * dizê-la. Mesma `queryKey` das telas de agenda e do diálogo de fecho: uma
   * requisição na rede.
   */
  const regraDaLoja = useGetDisponibilidade(activeLojaId!, {
    query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const gerarPlano = useGerarPlanoParcelas();
  const estornar = useEstornarParcela();
  const remover = useRemoveParcela();
  const perdoarMora = usePerdoarMora();
  const restabelecerMora = useRestabelecerMora();
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

  // S-C240 — as reservas VIVAS do contrato, já com nome e endereço, vindas da
  // porta. A ordem é a da porta (a mais antiga primeiro): a primeira reservada
  // é a que a noiva chama de "o meu vestido", o mesmo desempate do portal.
  const pecas = contrato?.pecas ?? [];

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
   * **S-C140 — a conta da rescisão, do servidor, ANTES do clique.**
   *
   * Ela chega preenchida no `GET /contratos/:id` quando o contrato é ATIVO, e
   * `null` quando ele já foi cancelado — registro morto não se recalcula. Não
   * há `useMemo` de conta nenhuma aqui **de propósito**: `calcularRescisao`
   * mora no `financeiro-core` e o front o importa (é o que `faixa-da-avaria.ts`
   * faz), mas `ItemDaRescisao` exige `exclusivaDePrimeiroAluguel` e o
   * `ContratoItem` não carrega `vestidos.exclusiva` nem a contagem de saídas.
   * Recalcular aqui erraria a cláusula 12ª, que é a que retém o aluguel
   * INTEIRO — a linha mais cara da conta.
   */
  const rescisao = contrato?.rescisao ?? null;
  // S-C151: o aviso acusa estorno CONTRA a cláusula, e pela 13ª devolver é o
  // que a cláusula manda — rescisão pela loja não pode ser acusada de obedecer.
  const avisoDoEstorno =
    rescisao && iniciativa === "LOCATARIA" ? estornoContraARescisao(rescisao, destinoPago) : null;

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
        // S-C151: a iniciativa VIAJA — o servidor calcula a rescisão com ela
        // (13ª: pela loja, devolve tudo) e a grava na trilha.
        data: { motivo: motivo.trim(), destinoPago, iniciativa },
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

  /**
   * **E224 — a retirada e a devolução se CORRIGEM.**
   *
   * Fechar só a porta do nascimento seria o meio conserto do E172: a vendedora
   * digitaria a retirada errada e o único caminho de volta seria cancelar o
   * contrato e fazer outro — que é o mesmo beco que o E219 achou nos itens.
   * O `PATCH /contratos/:id` já conferia a cláusula 4ª desde o E222 (a porta ao
   * lado que aquele épico mediu); o que faltava era quem a chamasse.
   *
   * O campo esvaziado manda `null` de propósito: apagar a data é uma decisão
   * tão legítima quanto trocá-la, e `undefined` deixaria a antiga no banco.
   */
  const abrirLocacao = () => {
    setRetiradaEditada(isoParaLocal(contrato.dataRetirada));
    setDevolucaoEditada(isoParaLocal(contrato.dataDevolucao));
    setPrazoEditado(
      contrato.prazoDevolucaoReservaDias != null ? String(contrato.prazoDevolucaoReservaDias) : "",
    );
    setLocacaoOpen(true);
  };

  const onSalvarLocacao = async () => {
    try {
      await atualizarContrato.mutateAsync({
        lojaId: activeLojaId!,
        contratoId: id!,
        data: {
          // S-C232 — o campo esvaziado manda `null` DE PROPÓSITO, e agora é
          // verdade: o spec aceita nullable e a porta apaga (antes o zod
          // convertia `null` em 01/01/1970 e a 4ª recusava por acidente).
          dataRetirada: localParaISO(retiradaEditada) ?? null,
          dataDevolucao: localParaISO(devolucaoEditada) ?? null,
          prazoDevolucaoReservaDias:
            prazoEditado.trim() !== "" && !Number.isNaN(Number(prazoEditado))
              ? Number(prazoEditado)
              : null,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetContratoQueryKey(activeLojaId!, id!),
      });
      toast({ title: "Datas da locação salvas" });
      setLocacaoOpen(false);
    } catch (err) {
      toast({
        title: "Não deu para salvar as datas",
        // As duas recusas do E222 chegam com `detalhe` citando o expediente por
        // extenso — a segunda perna de `mensagemApi`. Pôr os dois códigos no
        // dicionário local TROCARIA essa frase por uma pior: o dicionário vence
        // o `detalhe`, e nenhuma frase de tela sabe a que horas a loja abre.
        description: mensagemApi(err, "Confira as datas e tente de novo.", MENSAGENS_ERRO),
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

  /**
   * E226/S-C210 — o único gesto notável da 9ª é abrir mão dela.
   *
   * Cobrar é automático (decisão da dona, 13/08/2026: o contrato diz "deverá
   * incidir"); o que pede decisão é o contrário — quem decidiu não cobrar
   * R$ 15,00 de uma noiva, quando e por quê. As rotas existem desde o E213 e
   * estavam com ZERO usos no frontend, enquanto o portal já desenhava o selo do
   * perdão: a tela sabia mostrar o resultado de um gesto que ninguém podia
   * fazer.
   */
  const abrirPerdao = (parcela: Parcela) => {
    setMotivoPerdao("");
    setParcelaPerdoar(parcela);
  };

  const onPerdoarMora = async () => {
    if (!parcelaPerdoar) return;
    if (!motivoPerdao.trim()) {
      toast({ title: "Informe o motivo do perdão", variant: "destructive" });
      return;
    }
    try {
      await perdoarMora.mutateAsync({
        lojaId: activeLojaId!,
        parcelaId: parcelaPerdoar.id,
        data: { motivo: motivoPerdao.trim() },
      });
      await invalidarParcelas();
      toast({ title: "Multa e juros perdoados" });
      setParcelaPerdoar(null);
    } catch (err) {
      toast({
        title: "Não deu para perdoar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  // Desfazer não recalcula nada: a conta é derivada, então ela volta sozinha ao
  // valor de HOJE — que é maior que o do dia do perdão (nota da própria rota).
  const onRestabelecerMora = async (parcela: Parcela) => {
    try {
      await restabelecerMora.mutateAsync({ lojaId: activeLojaId!, parcelaId: parcela.id });
      await invalidarParcelas();
      toast({ title: "Cobrança da multa restabelecida" });
    } catch (err) {
      toast({
        title: "Não deu para restabelecer",
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
            ? [{
                rotulo: "Cancelar contrato",
                // S-C151: o diálogo abre sempre no padrão — a rescisão da noiva.
                // Herdar a escolha de uma abertura anterior gravaria "LOJA" num
                // cancelamento em que ninguém escolheu isso.
                onClick: () => {
                  setIniciativa("LOCATARIA");
                  setCancelarOpen(true);
                },
                destrutiva: true,
              }]
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
            {/* S-C35/E224 — a retirada e a devolução da cláusula 5ª. Elas eram
                gravadas pela API, impressas no PDF e não tinham onde ser
                lidas nem escritas: 1 contrato em 723 com retirada, nenhum com
                devolução. `instanteCurto` e não `diaMesAno`, porque a HORA é o
                que a 4ª decide — e o dia sozinho não diz a que horas voltar. */}
            <div data-testid="datas-da-locacao">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">Retirada e devolução</span>
                {podeMexer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={abrirLocacao}
                    data-testid="button-editar-locacao"
                  >
                    {contrato.dataRetirada || contrato.dataDevolucao ? "Alterar" : "Informar"}
                  </Button>
                )}
              </div>
              <p className="font-medium">
                {contrato.dataRetirada ? instanteCurto(contrato.dataRetirada) : "Retirada não informada"}
                {" · "}
                {contrato.dataDevolucao
                  ? instanteCurto(contrato.dataDevolucao)
                  : "devolução não informada"}
                {/* S-C211: o prazo pactuado é lido aqui — campo que só aparece
                    dentro do diálogo é campo que ninguém confere. */}
                {contrato.prazoDevolucaoReservaDias != null && (
                  <span data-testid="prazo-da-18a">
                    {" · "}18ª: {contrato.prazoDevolucaoReservaDias}{" "}
                    {contrato.prazoDevolucaoReservaDias === 1 ? "dia" : "dias"} de antecedência
                  </span>
                )}
              </p>
            </div>
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

        {/**
         * S-C240 — **as peças físicas do contrato, e o caminho até elas.**
         *
         * A tela do contrato falava de "reserva" em nove lugares e em nenhum
         * deles queria dizer a peça: eram todos a reserva de 40% da cláusula 8ª
         * §1º. Quem abria o contrato não via QUAL vestido está preso, e o
         * caminho para a peça física era sempre pela ficha dela — que é onde o
         * E223 pôs a porta de TROCA. O gesto que o contrato governa morava numa
         * tela a que o contrato não levava.
         *
         * Só as reservas VIVAS chegam aqui (a porta as filtra por
         * `canceladoEm`), pela mesma razão do portal: mostrar reserva cancelada
         * prometeria um vestido que a loja já liberou.
         */}
        <Card data-testid="pecas-do-contrato">
          <CardHeader>
            <CardTitle>Peças deste contrato</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Sem ramo de erro aqui de propósito, e é a exceção medida da
                S-C162: a página inteira retorna no `if (isError)` da :381 antes
                de qualquer frase, então a lista abaixo nunca é desenhada sobre
                uma consulta que falhou. A frase de vazio é honesta. */}
            {pecas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma peça do acervo presa por este contrato — ele pode ser só de serviço, ou a
                reserva foi desfeita.
              </p>
            ) : (
              <ul className="space-y-2">
                {pecas.map((p) => (
                  <li
                    key={p.bloqueioId}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.codigo ? `${p.codigo} · ` : ""}
                        {p.devolucaoFeitaEm
                          ? `devolvida em ${instanteDia(p.devolucaoFeitaEm)}`
                          : p.retiradaFeitaEm
                            ? `retirada em ${instanteDia(p.retiradaFeitaEm)}`
                            : "na loja"}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      {/* É a ficha da reserva que tem a troca (17ª), a prova e
                          a devolução — o contrato leva até lá em vez de repetir
                          os gestos numa segunda tela. */}
                      <Link to={`/loja/${lojaId}/reservas/${p.bloqueioId}`}>Abrir a reserva</Link>
                    </Button>
                  </li>
                ))}
              </ul>
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
                            {/* E226/S-C190 — a conta da 9ª por extenso, a mesma
                                frase que a noiva lê no portal. Um número maior
                                sem explicação ao lado é o que gera a ligação
                                para a loja — e aqui, a vendedora cobrando um
                                valor que ela não sabe justificar. */}
                            {parcela.mora && (
                              <p
                                className={`text-xs ${parcela.mora.perdoada ? "text-muted-foreground" : "text-destructive"}`}
                                data-testid={`mora-parcela-${parcela.numero}`}
                              >
                                {parcela.mora.explicacao}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            {/* S-C190 — era `valorPrevisto`: numa parcela de
                                R$ 500,00 vencida há 30 dias o portal dizia
                                R$ 515,00, a porta aceitava R$ 515,00, e esta
                                tela — a única de dinheiro da Vendedora, que tem
                                `financeiro: NADA` — oferecia R$ 500,00. */}
                            <p className={`font-semibold text-sm ${atrasada(parcela) ? "text-destructive" : ""}`}>
                              {brl(valorDaParcelaNaTela(parcela))}
                            </p>
                            {parcela.status === "PARCIAL" && !moraEmAberto(parcela) && (
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
                            {/* E226 — o gesto da 9ª, na régua do P6: o botão só
                                existe onde há o que perdoar, em vez de existir
                                levando ao 422 SEM_MORA. Já perdoada, o gesto é
                                o inverso. */}
                            {podePerdoarMora(parcela) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => abrirPerdao(parcela)}
                                data-testid={`button-perdoar-mora-${parcela.numero}`}
                              >
                                Perdoar multa
                              </Button>
                            )}
                            {parcela.mora?.perdoada && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void onRestabelecerMora(parcela)}
                                disabled={restabelecerMora.isPending}
                                data-testid={`button-restabelecer-mora-${parcela.numero}`}
                              >
                                Restabelecer cobrança
                              </Button>
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
                                {/* S-C50: o pagamento pode ter quitado duas
                                    linhas — a parcela e a multa da 9ª. Sem
                                    dizer isso, o link de R$ 515,00 embaixo de
                                    uma parcela de R$ 500,00 parece erro. */}
                                {brl(r.valor)} · {diaMesAno(r.pagoEm)}
                                {r.mora > 0 ? ` · inclui ${brl(r.mora)} de multa e juros` : ""}
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

      {/* E224 — as datas da locação, corrigíveis. O `PATCH /contratos/:id`
          confere a cláusula 4ª desde o E222; o que faltava era a tela. */}
      <Dialog open={locacaoOpen} onOpenChange={setLocacaoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirada e devolução</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void onSalvarLocacao();
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="data-retirada">Retirada</Label>
                <Input
                  id="data-retirada"
                  type="datetime-local"
                  value={retiradaEditada}
                  onChange={(e) => setRetiradaEditada(e.target.value)}
                  data-testid="input-data-retirada"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-devolucao">Devolução</Label>
                <Input
                  id="data-devolucao"
                  type="datetime-local"
                  value={devolucaoEditada}
                  onChange={(e) => setDevolucaoEditada(e.target.value)}
                  data-testid="input-data-devolucao"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              A loja retira e devolve {expedienteEmFrase(regraDaLoja.data)} (cláusula 4ª). Os dois
              campos são opcionais — deixe em branco o que ainda não foi combinado.
            </p>
            {/* E227/S-C211 — a antecedência da 18ª: quitado o carnê e devolvida
                a reserva com esta antecedência (dias antes da retirada), a
                rescisão da noiva devolve a fração comum inteira. Sem o número
                pactuado a cláusula não dispara — e não havia onde escrevê-lo. */}
            <div className="space-y-2">
              <Label htmlFor="prazo-devolucao-reserva">
                Prazo de devolução antecipada da reserva (cláusula 18ª)
              </Label>
              <Input
                id="prazo-devolucao-reserva"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="dias antes da retirada"
                value={prazoEditado}
                onChange={(e) => setPrazoEditado(e.target.value)}
                data-testid="input-prazo-devolucao-reserva"
              />
              <p className="text-xs text-muted-foreground">
                Pactuado no contrato: cancelando com o carnê quitado e com essa antecedência, a
                noiva recebe de volta também a dedução da 11ª. Em branco, a cláusula não se aplica.
              </p>
            </div>
            {/* A recusa da 4ª antes do clique, com a mesma frase do servidor. */}
            {(recusaDoExpediente(retiradaEditada, regraDaLoja.data) ||
              recusaDoExpediente(devolucaoEditada, regraDaLoja.data)) && (
              <div
                className="space-y-1 rounded-md border border-destructive bg-destructive/10 p-3 text-sm"
                data-testid="recusa-do-expediente"
              >
                {recusaDoExpediente(retiradaEditada, regraDaLoja.data) && (
                  <p>{recusaDoExpediente(retiradaEditada, regraDaLoja.data)}</p>
                )}
                {recusaDoExpediente(devolucaoEditada, regraDaLoja.data) && (
                  <p>{recusaDoExpediente(devolucaoEditada, regraDaLoja.data)}</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLocacaoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={atualizarContrato.isPending}>
                {atualizarContrato.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* E226 — perdoar a mora da 9ª. O motivo é obrigatório porque ele é o que
          fica: gravado NA parcela (`mora_perdoada_motivo`), é dele que o portal
          da noiva e este carnê desenham o selo — uma parcela vencida sem
          acréscimo e sem explicação ao lado é o que o E213 existiu para evitar. */}
      <Dialog open={parcelaPerdoar !== null} onOpenChange={(aberto) => !aberto && setParcelaPerdoar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Perdoar multa e juros</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void onPerdoarMora();
            }}
          >
            {parcelaPerdoar?.mora && (
              <p className="text-sm text-muted-foreground">
                {rotuloParcela(parcelaPerdoar)} — {parcelaPerdoar.mora.explicacao} A noiva passa a
                dever <strong className="text-foreground">{brl(saldoAberto(parcelaPerdoar))}</strong>{" "}
                em vez de {brl(parcelaPerdoar.mora.total)}.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="motivo-perdao">Por que a loja abre mão da cláusula 9ª?</Label>
              <Textarea
                id="motivo-perdao"
                placeholder="Ex.: a noiva avisou do atraso com antecedência"
                value={motivoPerdao}
                onChange={(e) => setMotivoPerdao(e.target.value)}
                maxLength={300}
                data-testid="input-motivo-perdao"
              />
              <p className="text-xs text-muted-foreground">
                O motivo fica gravado na parcela e aparece no portal da noiva.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setParcelaPerdoar(null)}>
                Voltar
              </Button>
              <Button type="submit" disabled={perdoarMora.isPending}>
                {perdoarMora.isPending ? "Perdoando…" : "Perdoar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

            {/* E227/S-C151 — quem rescinde decide qual cláusula responde: a
                noiva (8ª §2º/11ª/12ª/18ª, a conta do painel abaixo) ou a loja
                (13ª — devolve tudo). O campo existia na API desde o E217 e não
                tinha como ser dito. */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Quem está rescindindo?</p>
              <RadioGroup
                value={iniciativa}
                onValueChange={(v) => setIniciativa(v as "LOCATARIA" | "LOJA")}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="LOCATARIA" id="iniciativa-locataria" data-testid="iniciativa-locataria" />
                  <Label htmlFor="iniciativa-locataria" className="font-normal">
                    A noiva desistiu (locatária)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="LOJA" id="iniciativa-loja" data-testid="iniciativa-loja" />
                  <Label htmlFor="iniciativa-loja" className="font-normal">
                    A loja está cancelando (locadora)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* S-C151 — a 13ª por extenso quando é a LOJA: nada de painel de
                retenção, porque não há o que reter. A conta não se refaz aqui:
                devolver TUDO é a cláusula inteira, e o número já está no bloco
                "Já recebido" acima. */}
            {iniciativa === "LOJA" && (
              <div className="rounded-md border p-3 space-y-2" data-testid="cancelar-rescisao-loja">
                <p className="text-sm font-medium">O que o contrato manda, rescindindo pela loja</p>
                <p className="text-sm text-muted-foreground">
                  Cláusula 13ª: a loja devolve o que foi pago
                  {oQueSeraDesfeito.recebido > 0 ? <> — {brl(oQueSeraDesfeito.recebido)}</> : null}.
                  {oQueSeraDesfeito.recebido > 0 && (
                    <> A devolução nasce como conta a pagar da loja, vencendo em 30 dias (13ª §3º).</>
                  )}
                </p>
              </div>
            )}

            {/* S-C140: o que o INSTRUMENTO manda, antes do clique — molde do
                E211/E216/E218. A conta vem PRONTA do servidor (`rescisao` no
                GET), e não é recalculada aqui de propósito: o predicado da 12ª
                cruza `vestidos.exclusiva` com a contagem de saídas, e o
                `ContratoItem` não carrega nenhuma das duas metades. Refazer a
                conta na tela seria adivinhar justamente a linha mais cara.
                E227: o painel responde "se a NOIVA rescindir" — com a 13ª
                escolhida acima, quem responde é o bloco da loja. */}
            {iniciativa === "LOCATARIA" && rescisao && (
              <div className="rounded-md border p-3 space-y-2" data-testid="cancelar-rescisao">
                <p className="text-sm font-medium">O que o contrato manda, se a noiva rescindir</p>
                <ul className="text-sm space-y-1">
                  {rescisao.linhas.map((l) => (
                    <li key={`${l.clausula}-${l.descricao}`} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {l.descricao} <span className="text-xs">(cláusula {l.clausula})</span>
                      </span>
                      <span className="tabular-nums whitespace-nowrap">
                        retém {brl(l.retido)}
                        {l.devolvido > 0 && <> · devolve {brl(l.devolvido)}</>}
                      </span>
                    </li>
                  ))}
                  {rescisao.linhas.length === 0 && (
                    <li className="text-muted-foreground">
                      Nada foi pago — nada a reter, nada a devolver.
                    </li>
                  )}
                </ul>
                <div className="flex justify-between gap-3 border-t pt-2 text-sm font-medium">
                  <span>A loja retém {brl(rescisao.retencaoTotal)}</span>
                  <span className="tabular-nums">devolve {brl(rescisao.devolucaoTotal)}</span>
                </div>
                {rescisao.devolucaoTotal > 0 && (
                  <p className="text-xs text-muted-foreground">
                    A devolução nasce como conta a pagar da loja, vencendo em 30 dias (13ª §3º).
                  </p>
                )}
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
            {/* S-C140: a escolha manual FICA — ela é o caso em que a dona decide
                contra a régua. O que muda é que a divergência é dita, aqui e na
                trilha (`estornoContraARescisao`), como o E214 faz com a taxa de
                avaria fora da faixa. */}
            {avisoDoEstorno && (
              <Alert variant="destructive" data-testid="cancelar-estorno-contra-clausula">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{avisoDoEstorno}</AlertDescription>
              </Alert>
            )}
            <Textarea
              placeholder={
                avisoDoEstorno
                  ? "Motivo do cancelamento — e por que a loja devolveu o que a cláusula retém"
                  : "Motivo do cancelamento"
              }
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
