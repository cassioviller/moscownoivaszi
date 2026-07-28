import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetOrcamento,
  getGetOrcamentoQueryKey,
  getListOrcamentosQueryKey,
  useAddOrcamentoItem,
  useUpdateOrcamentoItem,
  useRemoveOrcamentoItem,
  useAprovarOrcamento,
  useRecusarOrcamento,
  useUpdateOrcamento,
  useCreateContrato,
  useCriarLinkOrcamento,
  useListContratos,
  getListContratosQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  useListVestidos,
  getListVestidosQueryKey,
  useListBloqueios,
  getListBloqueiosQueryKey,
  type OrcamentoItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NaoEncontrado } from "@/components/estado";
import { CabecalhoDetalhe } from "@/components/cabecalho-detalhe";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Trash2, Pencil, AlertCircle, ScrollText, Send, Undo2, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl, diaParaISO, statusOrcamentoLabel, instanteDia, instanteCurto } from "@/lib/formatos";
import { aplicarErroDoServidor, mensagemApi } from "@/lib/erro-api";
import { podeNoModulo } from "@/lib/permissoes";
import { brutoEmCentavos, centavos, liquidoEmCentavos, parseValor, reais } from "@/lib/financeiro/dinheiro";
import { ancoraDeNegocio, montarPlanoParcelas, type ParcelaPlanejada } from "@/lib/financeiro/plano";
import { diaDeNegocio, hojeLocal } from "@/lib/financeiro/datas";

// E95: não existe aritmética de dinheiro neste arquivo. O `round2` que morava
// aqui era a terceira cópia de uma conta que o servidor faz em centavos —
// todo número da tela sai agora da mesma função que o servidor vai validar.

/**
 * F17/E96 — o clique que fecha a venda deixa de mostrar texto de servidor.
 *
 * Era aqui o pior 422 do sistema: a vendedora, com a noiva do lado, lia
 * *"Itens menos desconto (950.48) difere do valor total (950.47)"* num diálogo
 * que continuava aberto e sem nenhum ajuste que resolvesse. Nove `catch` desta
 * tela despejavam `err.message` — ela ficou inteira de fora da varredura do E92.
 */
const MENSAGENS_ERRO: Record<string, string> = {
  // Depois do E95 este par não diverge mais por arredondamento — sobra o total
  // digitado à mão. A frase diz o que fazer, não o que aconteceu.
  VALOR_TOTAL_NAO_BATE: "O valor do contrato não bate com os itens do orçamento. Confira o desconto e os itens.",
  PARCELAS_NAO_BATEM: "A soma das parcelas não fecha com o total. Revise a entrada e o número de parcelas.",
  CORPO_INVALIDO: "Alguns campos precisam de ajuste — veja o que está marcado em vermelho.",
  REFERENCIA_INVALIDA: "Essa noiva não é desta loja.",
  ORCAMENTO_NAO_APROVADO: "Aprove o orçamento antes de gerar o contrato.",
  ORCAMENTO_RECUSADO: "Orçamento recusado não gera link para a noiva.",
  TRANSICAO_INVALIDA: "Esse orçamento não pode ir para esse status agora.",
  JA_TEM_CONTRATO: "Este orçamento já virou contrato.",
  CONTRATO_NAO_ATIVO: "O contrato foi cancelado — não há o que movimentar.",
};

const novoItemSchema = z.object({
  tipo: z.enum(["VESTIDO", "SERVICO", "AJUSTE"]),
  // vestidoId liga o item ao catálogo (E35): ao escolher um vestido, descrição
  // e valor vêm dele. Vazio = item avulso (serviço/ajuste ou vestido sem ficha).
  vestidoId: z.string().optional(),
  descricao: z.string().min(1, "Descrição obrigatória"),
  valorUnitario: z.string().min(1, "Valor obrigatório"),
  quantidade: z.string(),
});
type NovoItemValues = z.infer<typeof novoItemSchema>;

const editarItemSchema = z.object({
  descricao: z.string().min(1, "Descrição obrigatória"),
  valorUnitario: z.string().min(1, "Valor obrigatório"),
  quantidade: z.string(),
});
type EditarItemValues = z.infer<typeof editarItemSchema>;

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

const diaCurto = (dia: string) => format(ancoraDeNegocio(dia), "dd/MM/yyyy");

/**
 * F16 — o carnê que vai ser criado, à vista, antes de criar.
 *
 * A noiva pergunta "quanto fica por mês?" e a vendedora dividia de cabeça: o
 * plano só aparecia DEPOIS do contrato gerado, numa outra tela. E como a tela
 * montava as parcelas com uma conta própria, o que ela teria mostrado nem era
 * o que o servidor gravaria.
 *
 * As linhas aqui são o MESMO array que o `POST /contratos` recebe — não há
 * segunda conta entre o que a noiva vê e o que vai para o banco.
 */
function PreviaDoCarne({ erro, linhas }: { erro: string | null; linhas: ParcelaPlanejada[] | null }) {
  if (erro) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{erro}</AlertDescription>
      </Alert>
    );
  }
  if (!linhas || linhas.length === 0) return null;

  const entrada = linhas.find((l) => l.numero === 0);
  const parcelas = linhas.filter((l) => l.numero > 0);
  const primeira = parcelas[0];
  const ultima = parcelas[parcelas.length - 1];
  // A última só difere das irmãs quando a divisão não é exata — e é por isso
  // que ela merece ser dita: é o centavo que a noiva confere no carnê.
  const ultimaDifere = !!primeira && !!ultima && ultima.valorCentavos !== primeira.valorCentavos;

  return (
    <div className="bg-muted/40 space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        {entrada ? `Entrada de ${brl(reais(entrada.valorCentavos))} em ${diaCurto(entrada.vencimento)}` : null}
        {entrada && parcelas.length > 0 ? " · " : null}
        {parcelas.length > 0 ? (
          <>
            {parcelas.length}× de {brl(reais(primeira.valorCentavos))}
            {ultimaDifere ? ` (a última de ${brl(reais(ultima.valorCentavos))})` : null}
            {parcelas.length > 1 ? `, de ${diaCurto(primeira.vencimento)} a ${diaCurto(ultima.vencimento)}` : ` em ${diaCurto(primeira.vencimento)}`}
          </>
        ) : null}
      </p>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
        {linhas.map((l) => (
          <li key={l.numero} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{l.descricao}</span>
            <span className="tabular-nums">
              {brl(reais(l.valorCentavos))} · {diaCurto(l.vencimento)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OrcamentoDetail() {
  const { activeLojaId, user, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [contratoOpen, setContratoOpen] = useState(false);
  // E9: controlados porque agora são abertos por itens de menu — o
  // `AlertDialogTrigger` some junto com o menu ao selecionar.
  const [recusarOpen, setRecusarOpen] = useState(false);
  const [aprovarOpen, setAprovarOpen] = useState(false);
  // E72: as reservas físicas ativas da noiva entram no contrato (todas
  // marcadas por padrão) — cancelar o contrato passa a liberar as peças.
  const [reservasDesmarcadas, setReservasDesmarcadas] = useState<Set<string>>(new Set());
  const [itemEmEdicao, setItemEmEdicao] = useState<OrcamentoItem | null>(null);
  const [itemRemover, setItemRemover] = useState<OrcamentoItem | null>(null);

  const { data: orcamento, isLoading, isError, refetch } = useGetOrcamento(activeLojaId!, id!, {
    query: { queryKey: getGetOrcamentoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });
  // O teto de orçamento vive no interesse da noiva (E32/E33), que a LISTA de
  // leads não traz — só o GetLead completo. Busca-se pelo leadId do orçamento.
  const leadCompleto = useGetLead(activeLojaId!, orcamento?.leadId as string, {
    query: {
      queryKey: getGetLeadQueryKey(activeLojaId!, orcamento?.leadId as string),
      enabled: !!activeLojaId && !!orcamento?.leadId,
    },
  });
  // Catálogo para o seletor de item (E35). Só os ativos entram na escolha; um
  // vestido inativo já vinculado a um item antigo ainda aparece no rótulo.
  const vestidos = useListVestidos(activeLojaId!, {
    query: { queryKey: getListVestidosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const vestidoPorId = useMemo(
    () => new Map((vestidos.data ?? []).map((v) => [v.id, v])),
    [vestidos.data],
  );
  // O GetOrcamento não expõe o contrato gerado; buscamos na lista de contratos
  // (client-side, só quando APROVADO) para alternar Gerar/Ver contrato.
  const contratos = useListContratos(activeLojaId!, undefined, {
    query: {
      queryKey: getListContratosQueryKey(activeLojaId!),
      enabled: !!activeLojaId && orcamento?.status === "APROVADO",
    },
  });

  const addItem = useAddOrcamentoItem();
  const updateItem = useUpdateOrcamentoItem();
  const removeItem = useRemoveOrcamentoItem();
  const aprovar = useAprovarOrcamento();
  const recusar = useRecusarOrcamento();
  const atualizar = useUpdateOrcamento();
  const createContrato = useCreateContrato();
  const criarLink = useCriarLinkOrcamento();

  // E72: as reservas de casamento ativas da noiva — o contrato as prende.
  // E79: o recorte por noiva roda no banco; sobra o corte por tipo/cancelado.
  const paramsBloqueios = { leadId: orcamento?.leadId ?? "" };
  const bloqueiosQ = useListBloqueios(activeLojaId!, paramsBloqueios, {
    query: {
      queryKey: getListBloqueiosQueryKey(activeLojaId!, paramsBloqueios),
      enabled: !!activeLojaId && contratoOpen && !!orcamento?.leadId,
    },
  });
  const reservasDaNoiva = useMemo(
    () =>
      (bloqueiosQ.data ?? []).filter((b) => b.tipo === "RESERVA_CASAMENTO" && !b.canceladoEm),
    [bloqueiosQ.data],
  );

  // Gate flat por módulo (orçamentos vive sob "leads", como no sidebar).
  const podeEditar = podeNoModulo(acessosModulos, "leads", "editar");

  // D4 (E93): aqui havia um `useListLeads` SEM paginação — e sem
  // `pagina`/`porPagina` a rota devolve a loja inteira
  // (api-server/src/routes/leads.ts:135). Abrir UM orçamento numa loja com
  // 2.000 noivas baixava as 2.000 para achar um nome que o `getLead` da linha
  // acima já traz completo, com o teto de orçamento junto.
  const lead = leadCompleto.data;

  const contratoExistente = useMemo(
    () => contratos.data?.find((c) => c.orcamentoId === orcamento?.id),
    [contratos.data, orcamento?.id],
  );

  const totais = useMemo(() => {
    const brutoC = brutoEmCentavos(orcamento?.itens ?? []);
    const liquidoC = liquidoEmCentavos(brutoC, orcamento?.descontoTipo, orcamento?.descontoValor);
    return { bruto: reais(brutoC), liquido: reais(liquidoC), brutoC, liquidoC };
  }, [orcamento]);

  // Teto de orçamento da noiva (E33): o número que ela deu em Interesses e que
  // até agora ninguém confrontava. Se o líquido passa, a tela avisa ANTES do
  // envio — a conversa difícil na hora de ajustar, não depois do "achei caro".
  const teto = leadCompleto.data?.interesse?.tetoOrcamento ?? null;
  const acimaDoTeto = teto != null && teto > 0 && totais.liquido > teto;
  const excedenteTeto = acimaDoTeto ? reais(totais.liquidoC - centavos(teto)) : 0;

  const itemForm = useForm<NovoItemValues>({
    resolver: zodResolver(novoItemSchema),
    defaultValues: { tipo: "VESTIDO", vestidoId: "", descricao: "", valorUnitario: "", quantidade: "1" },
  });

  const editarItemForm = useForm<EditarItemValues>({
    resolver: zodResolver(editarItemSchema),
    defaultValues: { descricao: "", valorUnitario: "", quantidade: "1" },
  });

  const contratoForm = useForm<GerarContratoValues>({
    resolver: zodResolver(gerarContratoSchema),
    defaultValues: { cpf: "", formaPagamento: "", dataCasamento: "", entrada: "0", numParcelas: "1", primeiroVencimento: "" },
  });

  // F16/C2: o carnê que a tela vai criar, calculado ao vivo enquanto a
  // vendedora digita — e é o MESMO objeto que ela envia. Antes, a noiva
  // perguntava "quanto fica por mês?" e a vendedora dividia de cabeça; o plano
  // só aparecia depois do contrato gerado.
  const entradaDigitada = contratoForm.watch("entrada");
  const numParcelasDigitado = contratoForm.watch("numParcelas");
  const primeiroVencimento = contratoForm.watch("primeiroVencimento");
  const plano = useMemo((): { erro: string | null; linhas: ParcelaPlanejada[] | null } => {
    const totalC = totais.liquidoC;
    if (totalC <= 0) return { erro: "Adicione itens antes de gerar o contrato.", linhas: null };

    const entrada = parseValor(entradaDigitada ?? "");
    if (entrada !== null && !Number.isFinite(entrada)) {
      return { erro: "Entrada inválida — use apenas números.", linhas: null };
    }
    const entradaC = entrada === null ? 0 : centavos(entrada);
    if (entradaC < 0) return { erro: "A entrada não pode ser negativa.", linhas: null };
    if (entradaC > totalC) return { erro: "A entrada não pode superar o total.", linhas: null };

    const numParcelas = Math.trunc(Number(numParcelasDigitado) || 0);
    if (totalC - entradaC > 0 && numParcelas < 1) {
      return { erro: "Informe o número de parcelas.", linhas: null };
    }
    // Sem a data ainda não há carnê a mostrar — e isso não é erro, é formulário
    // pela metade: o toast só aparece se ela tentar enviar assim.
    if (!primeiroVencimento) return { erro: null, linhas: null };

    try {
      return {
        erro: null,
        linhas: montarPlanoParcelas({
          totalCentavos: totalC,
          entradaCentavos: entradaC,
          numParcelas,
          primeiroVencimento,
          // C6: o dia de HOJE no fuso da loja, não o instante. `new Date()`
          // das 21h à meia-noite carimbava a entrada no dia seguinte — e no
          // dia 31, no mês e na competência seguintes.
          vencimentoEntrada: hojeLocal(),
        }),
      };
    } catch {
      return { erro: "Não consegui montar o carnê com esses valores.", linhas: null };
    }
  }, [totais.liquidoC, entradaDigitada, numParcelasDigitado, primeiroVencimento]);

  // Desconto (aplicado via PATCH; estado local só para os inputs).
  const [descontoTipo, setDescontoTipo] = useState<string>("");
  const [descontoValor, setDescontoValor] = useState<string>("");
  // F18: a validade vem do servidor (que agora sempre a carimba) e a tela deixa
  // mudá-la. `diaDeNegocio` e não `diaLocal`: é uma data de negócio, ancorada
  // ao meio-dia — lê-la como instante joga o dia para trás em alguns fusos.
  const [validadeEditada, setValidadeEditada] = useState<string | null>(null);
  const validade = validadeEditada ?? (orcamento?.validade ? diaDeNegocio(orcamento.validade) : "");
  const setValidade = setValidadeEditada;

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
  if (!orcamento) {
    return (
      <NaoEncontrado
        titulo="Este orçamento não existe"
        voltarPara={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/loja/${activeLojaId}/orcamentos`}>Voltar aos orçamentos</Link>
          </Button>
        }
      />
    );
  }

  // Editável só em RASCUNHO/ENVIADO (aprovado é a base do contrato; recusado é read-only).
  const statusEditavel = orcamento.status === "RASCUNHO" || orcamento.status === "ENVIADO";
  const editavel = statusEditavel && podeEditar;
  const invalidar = () => queryClient.invalidateQueries({ queryKey: getGetOrcamentoQueryKey(activeLojaId!, id!) });
  const invalidarLista = () => queryClient.invalidateQueries({ queryKey: getListOrcamentosQueryKey(activeLojaId!) });

  const linkDaNoiva = (token: string) => `${window.location.origin}/orcamento/${token}`;

  const copiarLinkNoiva = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkDaNoiva(token));
      toast({ title: "Link copiado", description: "É só colar no WhatsApp da noiva." });
    } catch {
      // Sem clipboard (http, permissão negada): mostra o link para copiar à mão.
      toast({ title: "Não deu para copiar automaticamente", description: linkDaNoiva(token) });
    }
  };

  // Link vigente → só copia (o mesmo link segue valendo). Sem link ou vencido
  // → gera um novo (que também marca ENVIADO se ainda era rascunho) e copia.
  const linkVigente =
    orcamento?.publicoToken && orcamento.publicoExpiraEm && new Date(orcamento.publicoExpiraEm) > new Date()
      ? orcamento.publicoToken
      : null;

  const onLinkNoiva = async () => {
    if (linkVigente) {
      await copiarLinkNoiva(linkVigente);
      return;
    }
    try {
      const r = await criarLink.mutateAsync({ lojaId: activeLojaId!, orcamentoId: id! });
      await Promise.all([invalidar(), invalidarLista()]);
      await copiarLinkNoiva(r.token);
    } catch (err) {
      toast({ title: "Erro ao gerar o link", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onAddItem = async (values: NovoItemValues) => {
    // C3: `Number("5.800")` é 5,8 — quem digita cinco mil e oitocentos criava
    // um item de R$ 5,80 sem aviso nenhum. `parseValor` lê ponto de milhar e
    // vírgula decimal como pt-BR, e separa "não digitou" (null) de "digitou
    // bobagem" (NaN).
    const valorUnitario = parseValor(values.valorUnitario);
    const quantidade = Number(values.quantidade) || 1;
    if (valorUnitario === null || !Number.isFinite(valorUnitario) || valorUnitario <= 0) {
      toast({ title: "Valor unitário inválido", variant: "destructive" });
      return;
    }
    try {
      await addItem.mutateAsync({
        lojaId: activeLojaId!,
        orcamentoId: id!,
        data: {
          tipo: values.tipo,
          descricao: values.descricao,
          valorUnitario,
          quantidade,
          // vestidoId só faz sentido em item de vestido; serviço/ajuste vão sem.
          ...(values.tipo === "VESTIDO" && values.vestidoId ? { vestidoId: values.vestidoId } : {}),
        },
      });
      await invalidar();
      itemForm.reset({ tipo: values.tipo, vestidoId: "", descricao: "", valorUnitario: "", quantidade: "1" });
    } catch (err) {
      toast({ title: "Erro ao adicionar item", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const abrirEdicaoItem = (item: OrcamentoItem) => {
    editarItemForm.reset({
      descricao: item.descricao,
      valorUnitario: String(item.valorUnitario),
      quantidade: String(item.quantidade),
    });
    setItemEmEdicao(item);
  };

  const onEditarItem = async (values: EditarItemValues) => {
    if (!itemEmEdicao) return;
    const valorUnitario = parseValor(values.valorUnitario);
    const quantidade = Math.trunc(Number(values.quantidade) || 1);
    if (valorUnitario === null || !Number.isFinite(valorUnitario) || valorUnitario <= 0) {
      toast({ title: "Valor unitário inválido", variant: "destructive" });
      return;
    }
    if (quantidade < 1) {
      toast({ title: "Quantidade inválida", variant: "destructive" });
      return;
    }
    try {
      await updateItem.mutateAsync({
        lojaId: activeLojaId!,
        itemId: itemEmEdicao.id,
        data: { descricao: values.descricao, valorUnitario, quantidade },
      });
      await invalidar();
      toast({ title: "Item atualizado" });
      setItemEmEdicao(null);
    } catch (err) {
      toast({ title: "Erro ao atualizar item", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onRemoveItem = async (itemId: string) => {
    try {
      await removeItem.mutateAsync({ lojaId: activeLojaId!, itemId });
      await invalidar();
    } catch (err) {
      toast({ title: "Erro ao remover item", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onSalvarValidade = async () => {
    if (!validade) {
      toast({ title: "Informe até quando a proposta vale", variant: "destructive" });
      return;
    }
    try {
      await atualizar.mutateAsync({
        lojaId: activeLojaId!,
        orcamentoId: id!,
        data: { validade: diaParaISO(validade) },
      });
      setValidadeEditada(null);
      await invalidar();
      toast({ title: "Validade salva" });
    } catch (err) {
      toast({ title: "Erro ao salvar a validade", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
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
      toast({ title: "Erro ao aplicar desconto", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onMudarStatus = async (status: "ENVIADO" | "RASCUNHO") => {
    try {
      await atualizar.mutateAsync({ lojaId: activeLojaId!, orcamentoId: id!, data: { status } });
      await Promise.all([invalidar(), invalidarLista()]);
      toast({ title: status === "ENVIADO" ? "Orçamento marcado como enviado" : "Orçamento voltou para rascunho" });
    } catch (err) {
      toast({ title: "Erro ao mudar o status", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onAprovar = async () => {
    try {
      await aprovar.mutateAsync({ lojaId: activeLojaId!, orcamentoId: id! });
      await Promise.all([invalidar(), invalidarLista()]);
      toast({ title: "Orçamento aprovado" });
    } catch (err) {
      toast({ title: "Erro ao aprovar", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onRecusar = async () => {
    try {
      await recusar.mutateAsync({ lojaId: activeLojaId!, orcamentoId: id! });
      await Promise.all([invalidar(), invalidarLista()]);
      toast({ title: "Orçamento recusado" });
    } catch (err) {
      toast({ title: "Erro ao recusar", description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO), variant: "destructive" });
    }
  };

  const onGerarContrato = async (values: GerarContratoValues) => {
    if (plano.erro) {
      toast({ title: plano.erro, variant: "destructive" });
      return;
    }
    if (!plano.linhas) {
      toast({ title: "Informe o primeiro vencimento", variant: "destructive" });
      return;
    }

    // O carnê é o MESMO objeto que a prévia mostrou — não há segunda conta
    // entre o que a noiva viu e o que vai para o banco.
    const parcelas = plano.linhas.map((p) => ({
      numero: p.numero,
      descricao: p.descricao,
      valorPrevisto: reais(p.valorCentavos),
      vencimento: diaParaISO(p.vencimento),
    }));

    try {
      const contrato = await createContrato.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          leadId: orcamento.leadId,
          orcamentoId: orcamento.id,
          vendedoraId: user!.id,
          valorTotal: totais.liquido,
          // E72: prende as reservas marcadas — cancelar o contrato as liberta.
          bloqueioVestidoIds: reservasDaNoiva
            .filter((r) => !reservasDesmarcadas.has(r.id))
            .map((r) => r.id),
          cpf: values.cpf || undefined,
          formaPagamento: (values.formaPagamento || undefined) as (typeof FORMAS)[number] | undefined,
          dataCasamento: values.dataCasamento ? diaParaISO(values.dataCasamento) : undefined,
          parcelas,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListContratosQueryKey(activeLojaId!) });
      toast({ title: "Contrato gerado" });
      setContratoOpen(false);
      navigate(`/loja/${activeLojaId}/contratos/${contrato.id}`);
    } catch (err) {
      // D6: se o servidor disse ONDE, o recado vai para o campo — o diálogo
      // continua aberto por cima do toast, e um toast atrás dele é um recado
      // que a pessoa não lê.
      if (aplicarErroDoServidor(contratoForm, err)) return;
      toast({
        title: "Erro ao gerar contrato",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* E9: o status sai da fileira de botões e vira chip; a ação primária é a
          que o estado do orçamento pede (enviar → aprovar → ver contrato), e o
          resto vai para o menu. "Recusar" é destrutiva.

          Os dois AlertDialogs precisaram virar CONTROLADOS: um item de menu que
          abre um diálogo não funciona com `AlertDialogTrigger` embrulhando o
          botão — o menu fecha ao selecionar e desmonta o gatilho junto, então o
          diálogo nunca chega a abrir. */}
      <CabecalhoDetalhe
        trilha={[
          { rotulo: "Orçamentos", para: "/orcamentos" },
          ...(orcamento.leadId && lead?.noivaNome
            ? [{ rotulo: lead.noivaNome, para: `/noivas/${orcamento.leadId}` }]
            : []),
          { rotulo: "Orçamento" },
        ]}
        titulo={`Orçamento — ${lead?.noivaNome ?? "Noiva"}`}
        chip={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className="text-sm px-3 py-1">{statusOrcamentoLabel(orcamento.status)}</Badge>
            {/* F19: o aceite ao lado do status, e não só no rodapé — é o que
                decide se dá para aprovar sem perder a prova da noiva. */}
            <Badge variant={orcamento.aceitoEm ? "default" : "outline"} className="text-sm px-3 py-1">
              {orcamento.aceitoEm ? "Aceito pela noiva" : "Sem aceite da noiva"}
            </Badge>
          </span>
        }
        subtitulo={
          <>
            <p>
              Criado em {instanteDia(orcamento.createdAt)}
              {/* O aviso de abertura (E13): a noiva viu — a vendedora sabe a hora de puxar a conversa. */}
              {orcamento.publicoAbertoEm
                ? ` · aberto pela noiva em ${instanteCurto(orcamento.publicoAbertoEm)}`
                : orcamento.publicoToken
                  ? " · link enviado, ainda não aberto"
                  : ""}
            </p>
            {/* E74: o aceite digital — mais forte que "ela viu": ela concordou. */}
            {orcamento.aceitoEm && (
              <p className="text-positivo mt-0.5 font-medium">
                Aceito pela noiva em {instanteCurto(orcamento.aceitoEm)}
                {orcamento.aceiteVersao ? ` (versão ${orcamento.aceiteVersao} da proposta)` : ""}
              </p>
            )}
          </>
        }
        acaoPrimaria={
          orcamento.status === "APROVADO" ? (
            contratoExistente ? (
              <Button size="sm" asChild>
                <Link to={`/loja/${activeLojaId}/contratos/${contratoExistente.id}`}>
                  <ScrollText className="h-4 w-4 mr-2" />
                  Ver contrato
                </Link>
              </Button>
            ) : podeEditar && !contratos.isLoading ? (
              <Button size="sm" onClick={() => setContratoOpen(true)}>
                <ScrollText className="h-4 w-4 mr-2" />
                Gerar contrato
              </Button>
            ) : undefined
          ) : editavel ? (
            <Button size="sm" disabled={aprovar.isPending} onClick={() => setAprovarOpen(true)}>
              Aprovar
            </Button>
          ) : undefined
        }
        acoes={[
          ...(podeEditar && orcamento.status !== "RECUSADO"
            ? [{
                rotulo: criarLink.isPending
                  ? "Gerando…"
                  : linkVigente
                    ? "Copiar link da noiva"
                    : "Link para a noiva",
                onClick: onLinkNoiva,
                desabilitada: criarLink.isPending,
              }]
            : []),
          ...(editavel && orcamento.status === "RASCUNHO"
            ? [{ rotulo: "Marcar como enviado", onClick: () => onMudarStatus("ENVIADO"), desabilitada: atualizar.isPending }]
            : []),
          ...(editavel && orcamento.status === "ENVIADO"
            ? [{ rotulo: "Voltar para rascunho", onClick: () => onMudarStatus("RASCUNHO"), desabilitada: atualizar.isPending }]
            : []),
          ...(editavel
            ? [{ rotulo: "Recusar", onClick: () => setRecusarOpen(true), destrutiva: true, desabilitada: recusar.isPending }]
            : []),
        ]}
      />

      <AlertDialog open={recusarOpen} onOpenChange={setRecusarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar este orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O orçamento deixa de ser editável e fica registrado como recusado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRecusar}>Recusar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={aprovarOpen} onOpenChange={setAprovarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar este orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Aprovado, o orçamento vira a base do contrato e deixa de ser editável.
              {/* F19: aprovar antes do aceite APAGA o botão de aceite da noiva —
                  o portal só o oferece enquanto o orçamento está ENVIADO. O E74
                  morria por ordem de cliques, e a tela não dizia uma palavra. */}
              {!orcamento.aceitoEm && (
                <span className="text-destructive mt-2 block font-medium">
                  A noiva ainda não aceitou pelo link. Ao aprovar agora, o botão de aceite
                  some do portal dela — você fica sem a prova digital de que ela concordou
                  com este valor.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onAprovar}>Aprovar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Itens do orçamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orcamento.itens && orcamento.itens.length > 0 ? (
            <ul className="space-y-4">
              {orcamento.itens.map(item => (
                <li key={item.id} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <p className="font-medium">
                      {item.descricao}
                      {/* E35: item ligado ao catálogo — link para a ficha do vestido. */}
                      {item.vestidoId && (
                        <Link
                          to={`/loja/${activeLojaId}/vestidos/${item.vestidoId}`}
                          className="ml-2 text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-primary"
                          data-testid="link-item-vestido"
                        >
                          {vestidoPorId.get(item.vestidoId)?.codigo ?? "no catálogo"}
                        </Link>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">Qtd: {item.quantidade} x {brl(item.valorUnitario)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{brl(item.quantidade * item.valorUnitario)}</span>
                    {editavel && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar item"
                          onClick={() => abrirEdicaoItem(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover item"
                          disabled={removeItem.isPending}
                          onClick={() => setItemRemover(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nenhum item adicionado.</p>
          )}

          <div className="flex justify-end gap-6 text-sm border-t pt-3">
            <span className="text-muted-foreground">Subtotal: {brl(totais.bruto)}</span>
            {orcamento.descontoTipo && orcamento.descontoValor ? (
              <span className="text-muted-foreground">
                Desconto: {orcamento.descontoTipo === "PERCENTUAL" ? `${orcamento.descontoValor}%` : `${brl(orcamento.descontoValor)}`}
              </span>
            ) : null}
            <span className="money-md">Total: {brl(totais.liquido)}</span>
          </div>

          {acimaDoTeto && (
            <p
              className="flex items-center justify-end gap-1.5 text-sm text-amber-700 dark:text-amber-400"
              data-testid="aviso-acima-teto"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {brl(excedenteTeto)} acima do teto de {brl(teto!)} que a noiva definiu
            </p>
          )}

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
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            field.onChange(v);
                            // Trocar de tipo desfaz o vínculo com o catálogo.
                            if (v !== "VESTIDO") itemForm.setValue("vestidoId", "");
                          }}
                        >
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
                  {/* Seletor do catálogo (E35): escolher um vestido preenche
                      descrição e valor e vincula o item ao estoque. */}
                  {itemForm.watch("tipo") === "VESTIDO" && (
                    <div className="w-56 space-y-2">
                      <label className="text-sm font-medium">Do catálogo</label>
                      <Select
                        value={itemForm.watch("vestidoId") || "AVULSO"}
                        onValueChange={(v) => {
                          if (v === "AVULSO") {
                            itemForm.setValue("vestidoId", "");
                            return;
                          }
                          itemForm.setValue("vestidoId", v);
                          const ves = vestidoPorId.get(v);
                          if (ves) {
                            itemForm.setValue("descricao", ves.nome);
                            itemForm.setValue("valorUnitario", String(ves.precoBase));
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-vestido-catalogo">
                          <SelectValue placeholder="Escolher vestido" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AVULSO">— avulso (digitar) —</SelectItem>
                          {(vestidos.data ?? [])
                            .filter((v) => v.status === "ativo")
                            .map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.codigo} · {v.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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

              {/* F18: a validade era invisível e inalterável pela tela — só
                  existia se quem criou o orçamento tivesse mandado, e os dois
                  atalhos naturais não mandavam. É ela que põe a proposta na
                  fila de lembrete do E69. */}
              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <div className="w-44">
                  <label className="text-xs text-muted-foreground" htmlFor="orcamento-validade">
                    Proposta vale até
                  </label>
                  <Input
                    id="orcamento-validade"
                    type="date"
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={onSalvarValidade} disabled={atualizar.isPending}>
                  Salvar validade
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* GAP Onda 3+: "Vestidos indicados" do orcamentos (curadoria por afinidade via
          indicarVestidos, com valor padrão × orçado por item) — sem endpoint de indicação
          no client gerado; itens entram pelo formulário manual acima. */}

      <Dialog open={!!itemEmEdicao} onOpenChange={(aberto) => { if (!aberto) setItemEmEdicao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar item</DialogTitle>
          </DialogHeader>
          <Form {...editarItemForm}>
            <form onSubmit={editarItemForm.handleSubmit(onEditarItem)} className="space-y-4">
              <FormField
                control={editarItemForm.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editarItemForm.control}
                  name="valorUnitario"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor unitário (R$)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editarItemForm.control}
                  name="quantidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setItemEmEdicao(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateItem.isPending}>
                  {updateItem.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={contratoOpen} onOpenChange={setContratoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar contrato — {brl(totais.liquido)}</DialogTitle>
          </DialogHeader>
          <Form {...contratoForm}>
            <form onSubmit={contratoForm.handleSubmit(onGerarContrato)} className="space-y-4">
              {/* E72: as reservas ativas da noiva entram no contrato — todas
                  marcadas por padrão; cancelar o contrato as libera. */}
              {reservasDaNoiva.length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Peças reservadas que este contrato prende</p>
                  {reservasDaNoiva.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!reservasDesmarcadas.has(r.id)}
                        onChange={(e) =>
                          setReservasDesmarcadas((prev) => {
                            const nova = new Set(prev);
                            if (e.target.checked) nova.delete(r.id);
                            else nova.add(r.id);
                            return nova;
                          })
                        }
                      />
                      <span>
                        {r.vestido?.codigo ?? "?"} · {r.vestido?.nome ?? "vestido"}
                      </span>
                    </label>
                  ))}
                </div>
              )}
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
                      <FormLabel>1ª parcela vence em *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <PreviaDoCarne erro={plano.erro} linhas={plano.linhas} />

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

      <AlertDialog open={!!itemRemover} onOpenChange={(aberto) => !aberto && setItemRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este item?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemRemover?.descricao} sai do orçamento e o total é recalculado. Não dá para
              desfazer — se foi engano, o item precisa ser lançado de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (itemRemover) onRemoveItem(itemRemover.id);
                setItemRemover(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
