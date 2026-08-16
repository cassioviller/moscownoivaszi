import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { podeNoModulo } from "@/lib/permissoes";
import {
  useListComissaoRegras,
  getListComissaoRegrasQueryKey,
  useCreateComissaoRegra,
  useDeleteComissaoRegra,
  useUpdateComissaoRegra,
  useListComissaoFechamentos,
  getListComissaoFechamentosQueryKey,
  usePreviewComissao,
  getPreviewComissaoQueryKey,
  useGerarComissaoFechamento,
  useBaixarEstornoComissao,
  useListBaixasEstornoComissao,
  getListBaixasEstornoComissaoQueryKey,
  useListPendenciasComissao,
  getListPendenciasComissaoQueryKey,
  useReabrirComissaoFechamento,
  useListEquipe,
  getListEquipeQueryKey,
  useSimularComissao,
  type ComissaoFaixa,
  type ComissaoRegra,
  type SimulacaoComissao,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Plus, FlaskConical, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { brl, diaMesAno } from "@/lib/formatos";
import { competenciaAtual, ultimasCompetencias } from "@/lib/financeiro/datas";
import { parseValor, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { rotuloCompetencia } from "@/lib/financeiro/datas";
import { capitalizar } from "@/lib/formatos";
import { ErroListagem, invalidarCaixa } from "@/pages/financeiro/helpers";
import { mensagemApi } from "@/lib/erro-api";
import { serieDeComissao } from "@/lib/comissao-serie";
import { CACHE_ESTAVEL } from "@/lib/cache";

/**
 * Comissões: a escada de cada vendedora, o ranking ao vivo do mês e o
 * fechamento.
 *
 * Duas coisas que a tela precisa deixar explícitas, porque contrariam a
 * intuição: a faixa do acumulado FINAL rege o mês inteiro (retroativo, não é
 * progressivo como imposto de renda), e um intervalo sem faixa não comissiona.
 */

const MENSAGENS_ERRO: Record<string, string> = {
  FAIXAS_INVALIDAS: "A escada de faixas está incoerente — confira os intervalos.",
  VENDEDORA_INVALIDA: "Essa vendedora não é da loja.",
  COMPETENCIA_CORRENTE: "O mês corrente ainda pode receber vendas — só se fecha mês passado.",
  COMPETENCIA_JA_FECHADA: "Esta competência já foi fechada.",
  SEM_MOVIMENTO: "Nenhuma venda nesta competência.",
  COMISSAO_JA_PAGA: "A comissão já foi paga — estorne o pagamento antes de reabrir.",
  FECHAMENTO_NAO_ENCONTRADO: "Fechamento não encontrado.",
  // S-O121 (decisão da dona, 15/08/2026): reabre-se de trás para a frente.
  FECHAMENTO_NAO_E_O_ULTIMO: "Esta vendedora tem fechamento mais recente — reabra do último para o primeiro.",
};

const MOTIVO_FAIXA: Record<string, string> = {
  sem_faixas: "Defina ao menos uma faixa.",
  min_negativo: "O mínimo não pode ser negativo.",
  intervalo_invalido: "O máximo precisa ser maior que o mínimo.",
  faixa_vazia: "Cada faixa precisa pagar percentual ou bônus.",
  valor_negativo: "Valores não podem ser negativos.",
  aberta_no_meio: "Só a última faixa pode ficar sem máximo.",
  sobreposicao: "Duas faixas cobrem o mesmo valor.",
};

/** Quantos meses fechados a série mostra — um ano dá para ver sazonalidade. */
const MESES_NA_SERIE = 12;


/** Uma faixa em edição — strings, porque vêm do teclado. */
/**
 * D11/E99 — a faixa carrega um id LOCAL, e ele existe só para o React.
 *
 * As linhas eram keyadas por índice num editor onde se REMOVE do meio
 * (`filter((_, j) => j !== i)`): ao apagar a segunda de três, o React reaproveita
 * o nó da terceira como se fosse a segunda, e o foco salta de campo — no meio
 * da digitação de uma escada de comissão, que é uma tela de dinheiro. O id não
 * viaja para o servidor: o payload continua sendo min/max/percentual/bônus.
 */
type FaixaForm = {
  id: string;
  minAcumulado: string;
  maxAcumulado: string;
  percentual: string;
  bonusFixo: string;
};

/** Uma faixa nova, com identidade própria desde o nascimento. */
function faixaVazia(): FaixaForm {
  return { id: crypto.randomUUID(), minAcumulado: "", maxAcumulado: "", percentual: "", bonusFixo: "" };
}


function descreverFaixa(f: ComissaoFaixa): string {
  const ate = f.maxAcumulado === null || f.maxAcumulado === undefined
    ? "acima"
    : `até ${brl(f.maxAcumulado)}`;
  const paga = [
    f.percentual ? `${f.percentual}%` : null,
    f.bonusFixo ? `+ ${brl(f.bonusFixo)}` : null,
  ].filter(Boolean).join(" ");
  return `De ${brl(f.minAcumulado)} ${ate} → ${paga}`;
}

export default function Comissoes() {
  const { activeLojaId, acessosModulos } = useAuth();
  /**
   * S36 pôs o módulo certo (comissao, era admin) — e a S-M21 pôs a AÇÃO e a
   * EXCEÇÃO certas (fecha dois sítios da S-M9):
   *
   * - "Salvar regra" é POST → o servidor deriva CRIAR; a seção inteira
   *   rendia SEM gate nenhum, e a vendedora só-ver montava a escada e levava
   *   403 no salvar (o Trash de versão idem, com editar).
   * - "Dar baixa" no estorno exige requireModulo("admin","editar") EXPLÍCITO
   *   na rota (comissao.ts: "uma decisão humana, gateada por admin"), ALÉM do
   *   prefixo comissao — o S36 afirmou que as três ações compartilham a mesma
   *   guarda, e a baixa nunca compartilhou.
   * - Reabrir e remover versão são DELETE → editar, e casavam.
   */
  const podeMexerNaComissao = podeNoModulo(acessosModulos, "comissao", "editar");
  const podeCriarRegra = podeNoModulo(acessosModulos, "comissao", "criar");
  const podeBaixarEstorno =
    podeMexerNaComissao && podeNoModulo(acessosModulos, "admin", "editar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const competencia = searchParams.get("competencia") ?? competenciaAtual();

  const regras = useListComissaoRegras(activeLojaId!, {
    query: { queryKey: getListComissaoRegrasQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const equipe = useListEquipe(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const paramsPreview = { competencia };
  const preview = usePreviewComissao(activeLojaId!, paramsPreview, {
    query: {
      queryKey: getPreviewComissaoQueryKey(activeLojaId!, paramsPreview),
      enabled: !!activeLojaId,
    },
  });
  // D10 (E93): aqui havia uma SEGUNDA chamada ao mesmo endpoint, com
  // {competencia} — um recorte estrito do que o `historico` abaixo já traz em
  // mãos. Um request a menos no mount, uma invalidação a menos por ação, e a
  // lista de fechados parou de piscar a cada troca de competência no seletor
  // (o histórico não muda quando a competência muda).
  //
  // Sem filtro: a série (E52) é sobre o histórico, não sobre a competência em
  // vista. A lista é pequena por natureza — uma linha por vendedora por mês.
  const historico = useListComissaoFechamentos(activeLojaId!, undefined, {
    query: {
      queryKey: getListComissaoFechamentosQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });
  // A varredura das competências esquecidas (E53). Sem parâmetro: a pergunta
  // é sobre o passado inteiro da janela, não sobre a competência em vista.
  const pendencias = useListPendenciasComissao(activeLojaId!, {
    query: {
      queryKey: getListPendenciasComissaoQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });
  const competenciasPendentes = pendencias.data ?? [];
  const baixas = useListBaixasEstornoComissao(activeLojaId!, {
    query: {
      queryKey: getListBaixasEstornoComissaoQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  const criarRegra = useCreateComissaoRegra();
  const removerRegra = useDeleteComissaoRegra();
  /**
   * S-O131 — a porta `PATCH /comissao/regras/:id` (ativo, bonusAcumulaFaixas)
   * existia sem tela: a lista já mostrava "inativa" e nenhum gesto chegava lá.
   * Desativar é o meio-termo entre deixar e remover — a escada sai de vigor e
   * fica na história, com as faixas.
   */
  const atualizarRegra = useUpdateComissaoRegra();
  const gerarFechamento = useGerarComissaoFechamento();
  const baixarEstorno = useBaixarEstornoComissao();
  const reabrirFechamento = useReabrirComissaoFechamento();
  const simular = useSimularComissao();

  // Resultado da simulação (E23) — abre o dialog quando chega.
  const [simulacao, setSimulacao] = useState<SimulacaoComissao | null>(null);

  /**
   * D7/E99 — "ainda não sei" não é "zero".
   *
   * O `resumoFechamento` abaixo devolve `qtd: 0` nos DOIS casos: quando não há
   * comissão a lançar e quando o preview ainda está no ar. O diálogo tratava os
   * dois igual e afirmava "nenhuma comissão a lançar" antes de saber — numa
   * ação que fecha o mês e não tem desfazer.
   */
  const calculando = preview.isPending;

  // Resumo do que o fechamento vai LANÇAR em contas a pagar — o número que dá
  // confiança antes de uma ação irreversível.
  const resumoFechamento = useMemo(() => {
    const linhas = (preview.data ?? []).filter((l) => l.valorTotal > 0);
    // C11: soma em CENTAVOS INTEIROS. Em float, seis vendedoras a R$ 1.234,57
    // fecham com um centavo a menos que a soma das linhas — e um total que não
    // bate com o que está impresso acima dele vira desconfiança no número.
    // somaCentavos recebe o valor em REAIS e converte por dentro — passar
    // centavos() aqui dobraria a conversão.
    return { qtd: linhas.length, total: reais(somaCentavos(linhas, (l) => l.valorTotal)) };
  }, [preview.data]);

  // A série do custo de comissão (E52): agregação pura sobre o histórico já
  // persistido — nenhum recálculo, então o número aqui é o que foi pago.
  const serie = useMemo(
    () => serieDeComissao(historico.data ?? [], { meses: MESES_NA_SERIE }),
    [historico.data],
  );
  // A escala das barras: contra o MAIOR custo, nunca contra zero.
  const maiorCusto = useMemo(
    () => Math.max(...serie.pontos.map((p) => p.custoComissao), 0.01),
    [serie.pontos],
  );

  // Regra em vias de ser apagada (abre a confirmação nomeando a vendedora).
  const [regraRemovendo, setRegraRemovendo] = useState<{ id: string; nome: string } | null>(null);

  // Estorno em vias de baixa (abre a confirmação nomeando a vendedora e o valor).
  const [estornoBaixando, setEstornoBaixando] = useState<
    { vendedoraId: string; nome: string; valor: number } | null
  >(null);
  const [motivoBaixa, setMotivoBaixa] = useState("");

  // Fechamento em vias de reabertura (E54) — nomeia a vendedora e o valor.
  const [fechamentoReabrindo, setFechamentoReabrindo] = useState<
    { id: string; nome: string; valor: number } | null
  >(null);

  async function onReabrirFechamento() {
    if (!fechamentoReabrindo) return;
    try {
      const res = await reabrirFechamento.mutateAsync({
        lojaId: activeLojaId!,
        fechamentoId: fechamentoReabrindo.id,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListComissaoFechamentosQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getListPendenciasComissaoQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getPreviewComissaoQueryKey(activeLojaId!, paramsPreview) }),
        // D9: fechar/reabrir MEXE em conta a pagar — a curva do alerta de caixa
        // (dashboard e sino) muda com ela, não só a lista de contas.
        invalidarCaixa(queryClient, activeLojaId!),
      ]);
      setFechamentoReabrindo(null);
      toast({
        title: `Fechamento de ${rotuloCompetencia(competencia)} reaberto`,
        description: res.estornosReabertos > 0
          ? `${res.estornosReabertos} estorno(s) voltaram a pendentes.`
          : "A competência pode ser fechada de novo.",
      });
    } catch (err) {
      toast({
        title: "Não deu para reabrir",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  const [vendedoraId, setVendedoraId] = useState("");
  const [bonusAcumula, setBonusAcumula] = useState(false);
  const [faixas, setFaixas] = useState<FaixaForm[]>([faixaVazia()]);

  const competenciasDisponiveis = useMemo(
    () => ultimasCompetencias(competenciaAtual(), 12).reverse(),
    [],
  );

  const trocarCompetencia = (c: string) => {
    const proximo = new URLSearchParams(searchParams);
    proximo.set("competencia", c);
    setSearchParams(proximo, { replace: true });
  };

  const atualizarFaixa = (i: number, campo: keyof FaixaForm, valor: string) =>
    setFaixas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  /**
   * Converte as faixas digitadas ou null se algo é inválido. Vazio e lixo são
   * coisas diferentes: em branco é "sem teto"/"não paga", texto inválido é
   * engano de digitação e não pode virar 0 silenciosamente.
   */
  function converterFaixas() {
    const convertidas = [];
    for (const f of faixas) {
      const min = parseValor(f.minAcumulado);
      const max = parseValor(f.maxAcumulado);
      const pct = parseValor(f.percentual);
      const bonus = parseValor(f.bonusFixo);
      if (min === null || Number.isNaN(min) || [max, pct, bonus].some((v) => v !== null && Number.isNaN(v))) {
        return null;
      }
      convertidas.push({ minAcumulado: min, maxAcumulado: max, percentual: pct, bonusFixo: bonus });
    }
    return convertidas;
  }

  async function onSalvarRegra() {
    if (!vendedoraId) {
      toast({ title: "Escolha a vendedora", variant: "destructive" });
      return;
    }
    const convertidas = converterFaixas();
    if (!convertidas) {
      toast({ title: "Há valor inválido nas faixas", variant: "destructive" });
      return;
    }

    try {
      await criarRegra.mutateAsync({
        lojaId: activeLojaId!,
        data: { vendedoraId, bonusAcumulaFaixas: bonusAcumula, faixas: convertidas },
      });
      await queryClient.invalidateQueries({ queryKey: getListComissaoRegrasQueryKey(activeLojaId!) });
      await queryClient.invalidateQueries({ queryKey: getPreviewComissaoQueryKey(activeLojaId!, paramsPreview) });
      setFaixas([faixaVazia()]);
      setVendedoraId("");
      setBonusAcumula(false);
      toast({ title: "Regra salva" });
    } catch (err) {
      const e = err as { data?: { error?: string; detalhe?: string } };
      const detalhe = e?.data?.error === "FAIXAS_INVALIDAS" ? MOTIVO_FAIXA[e.data.detalhe ?? ""] : undefined;
      toast({
        title: "Não deu para salvar a regra",
        description: detalhe ?? mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function onAlternarRegra(regraId: string, ativo: boolean) {
    try {
      await atualizarRegra.mutateAsync({ lojaId: activeLojaId!, regraId, data: { ativo } });
      await queryClient.invalidateQueries({ queryKey: getListComissaoRegrasQueryKey(activeLojaId!) });
      toast({ title: ativo ? "Regra reativada" : "Regra desativada" });
    } catch (err) {
      toast({
        title: ativo ? "Não deu para reativar" : "Não deu para desativar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function onRemoverRegra() {
    if (!regraRemovendo) return;
    try {
      await removerRegra.mutateAsync({ lojaId: activeLojaId!, regraId: regraRemovendo.id });
      await queryClient.invalidateQueries({ queryKey: getListComissaoRegrasQueryKey(activeLojaId!) });
      setRegraRemovendo(null);
      toast({ title: "Regra removida" });
    } catch (err) {
      toast({
        title: "Não deu para remover",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function onGerarFechamento() {
    try {
      const criados = await gerarFechamento.mutateAsync({ lojaId: activeLojaId!, data: { competencia } });
      await Promise.all([
        // D9: fechar/reabrir MEXE em conta a pagar — a curva do alerta de caixa
        // (dashboard e sino) muda com ela, não só a lista de contas.
        invalidarCaixa(queryClient, activeLojaId!),
        // O histórico alimenta a série (E52) e a varredura alimenta o alerta
        // (E53): fechar acabou de mudar os dois, e um alerta que sobrevive à
        // ação que o resolve é pior do que alerta nenhum.
        queryClient.invalidateQueries({ queryKey: getListComissaoFechamentosQueryKey(activeLojaId!) }),
        queryClient.invalidateQueries({ queryKey: getListPendenciasComissaoQueryKey(activeLojaId!) }),
      ]);
      toast({
        title: `Fechamento de ${rotuloCompetencia(competencia)} gerado`,
        description: `${criados.length} vendedora(s) — as contas a pagar foram lançadas.`,
      });
    } catch (err) {
      toast({
        title: "Não deu para gerar o fechamento",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function onBaixarEstorno() {
    if (!estornoBaixando) return;
    const motivo = motivoBaixa.trim();
    try {
      const r = await baixarEstorno.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          vendedoraId: estornoBaixando.vendedoraId,
          competencia,
          motivo: motivo || null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getPreviewComissaoQueryKey(activeLojaId!, paramsPreview) }),
        queryClient.invalidateQueries({ queryKey: getListBaixasEstornoComissaoQueryKey(activeLojaId!) }),
      ]);
      setEstornoBaixando(null);
      setMotivoBaixa("");
      toast({
        title: "Estorno baixado",
        description: `${brl(r.valorBaixado)} de ${estornoBaixando.nome} — o valor deixa de carregar.`,
      });
    } catch (err) {
      toast({
        title: "Não deu para baixar o estorno",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  /** E23: a escada digitada, aplicada às bases reais dos últimos 3 meses. */
  async function onSimular() {
    if (!vendedoraId) {
      toast({ title: "Escolha a vendedora", variant: "destructive" });
      return;
    }
    const convertidas = converterFaixas();
    if (!convertidas) {
      toast({ title: "Há valor inválido nas faixas", variant: "destructive" });
      return;
    }
    try {
      const resultado = await simular.mutateAsync({
        lojaId: activeLojaId!,
        data: { vendedoraId, bonusAcumulaFaixas: bonusAcumula, faixas: convertidas },
      });
      setSimulacao(resultado);
    } catch (err) {
      const e = err as { data?: { error?: string; detalhe?: string } };
      const detalhe = e?.data?.error === "FAIXAS_INVALIDAS" ? MOTIVO_FAIXA[e.data.detalhe ?? ""] : undefined;
      toast({
        title: "Não deu para simular",
        description: detalhe ?? mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  const nomePorUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const membro of equipe.data ?? []) mapa.set(membro.usuarioId, membro.nome);
    return mapa;
  }, [equipe.data]);

  /**
   * Linha do tempo (E17): a API sempre devolveu TODAS as versões da escada,
   * mas a lista plana as exibia como regras irmãs — redefinir a vigência
   * parecia apagar o histórico. Agrupar por vendedora e rotular cada versão
   * (vigente / futura / encerrada) é o que responde "por que março pagou
   * diferente?": a escada de março continua aqui, com o período em que valeu.
   */
  const linhaDoTempo = useMemo(() => {
    const porVendedora = new Map<string, ComissaoRegra[]>();
    for (const regra of regras.data ?? []) {
      const lista = porVendedora.get(regra.vendedoraId) ?? [];
      lista.push(regra);
      porVendedora.set(regra.vendedoraId, lista);
    }
    const agora = Date.now();
    return [...porVendedora.entries()]
      .map(([vendedoraId, versoes]) => {
        versoes.sort(
          (a, b) => new Date(b.vigenciaInicio).getTime() - new Date(a.vigenciaInicio).getTime(),
        );
        // A vigente: a mais recente ATIVA que já começou — o mesmo critério do motor.
        const vigente = versoes.find(
          (v) => v.ativo && new Date(v.vigenciaInicio).getTime() <= agora,
        );
        const nome =
          versoes[0].vendedoraNome ?? nomePorUsuario.get(vendedoraId) ?? "Vendedora";
        return { vendedoraId, nome, versoes, vigenteId: vigente?.id ?? null };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [regras.data, nomePorUsuario]);

  // Os fechamentos DESTA competência, recortados do histórico já carregado.
  const fechamentosDaCompetencia = useMemo(
    () => (historico.data ?? []).filter((f) => f.competencia === competencia),
    [historico.data, competencia],
  );
  const jaFechada = fechamentosDaCompetencia.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-serif">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          A faixa que a vendedora alcançar no fim do mês vale para tudo que ela vendeu — bater o
          próximo degrau compensa até o último dia.
        </p>
      </div>

      {/* — E53: a competência esquecida. O fechamento é um mês por vez e nada
          sinalizava o mês que ficou para trás: a vendedora não recebe, ninguém
          reclama porque ninguém sabe, e a pendência acumula invisível. Cada
          linha LEVA à competência — avisar sem dar o caminho é meio aviso. — */}
      {/* S-O65/E187: a lista sai da consulta para uma const ANTES do
          `length > 0` — a pergunta pelo `?.length ?? 0` e a resposta pelo
          `data!` eram a mesma frase escrita de dois jeitos, e a asserção é a
          que sobrevive a quem mexer na guarda (S-O16). */}
      {competenciasPendentes.length > 0 && (
        <Alert variant="destructive" data-testid="pendencias-comissao">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {competenciasPendentes.length === 1
              ? "Uma competência passada ainda não foi fechada"
              : `${competenciasPendentes.length} competências passadas ainda não foram fechadas`}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            {competenciasPendentes.map((p) => (
              <div key={p.competencia} className="flex flex-wrap items-baseline gap-x-2">
                <button
                  type="button"
                  className="font-medium underline underline-offset-4"
                  onClick={() => trocarCompetencia(p.competencia)}
                >
                  {capitalizar(rotuloCompetencia(p.competencia))}
                </button>
                <span className="text-xs">
                  {brl(p.totalVendas)} em vendas · {p.vendedoras}{" "}
                  {p.vendedoras === 1 ? "vendedora" : "vendedoras"} sem fechamento
                </span>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="competencia" className="text-xs text-muted-foreground">
            Competência
          </Label>
          <Select value={competencia} onValueChange={trocarCompetencia}>
            <SelectTrigger id="competencia" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {competenciasDisponiveis.map((c) => (
                <SelectItem key={c} value={c}>
                  {capitalizar(rotuloCompetencia(c))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={gerarFechamento.isPending || jaFechada}>
              {gerarFechamento.isPending ? "Fechando…" : "Fechar competência"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fechar {rotuloCompetencia(competencia)}?</AlertDialogTitle>
              {/* D7/E99 — a tela AFIRMAVA "nenhuma comissão a lançar" enquanto
                  o preview ainda estava carregando: `resumoFechamento.qtd` é 0
                  tanto quando não há comissão quanto quando ainda não se sabe.
                  A frase saía idêntica nos dois casos, num diálogo que fecha o
                  mês de forma IRREVERSÍVEL. É a tela mentindo sobre dinheiro
                  para acelerar um clique que não tem volta. */}
              <AlertDialogDescription>
                {calculando
                  ? "Calculando o que será lançado…"
                  : resumoFechamento.qtd === 0
                    ? "Nenhuma comissão a lançar nesta competência — o fechamento apenas trava o mês."
                    : `Isto vai lançar ${resumoFechamento.qtd} ${resumoFechamento.qtd === 1 ? "comissão" : "comissões"} em contas a pagar, somando ${brl(resumoFechamento.total)}.`}
                {" "}O mês fica fechado e a ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={onGerarFechamento}
                disabled={gerarFechamento.isPending || calculando}
              >
                {gerarFechamento.isPending ? "Fechando…" : "Fechar competência"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {jaFechada && <Badge variant="secondary">Já fechada</Badge>}
      </div>

      {/* — Ranking ao vivo — */}
      <Card>
        <CardHeader>
          <CardTitle>Como está o mês</CardTitle>
          <CardDescription>
            {capitalizar(rotuloCompetencia(competencia))} — o que seria pago se fechasse agora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview.isError ? (
            <ErroListagem mensagem="Falha ao calcular o ranking." onRetry={() => preview.refetch()} />
          ) : preview.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (preview.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda nesta competência.</p>
          ) : (
            <ul className="divide-y">
              {preview.data?.map((linha) => {
                // Sem venda no mês, ela só está aqui pelo estorno: dizer
                // "vendeu R$ 0,00 · sem faixa atingida" seria ruído, e chamar o
                // estorno de "abatido" seria falso — não houve de que abater.
                const soEstorno = linha.totalVendas === 0 && !!linha.estornoPendente;
                return (
                <li key={linha.vendedoraId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{linha.vendedoraNome ?? "Vendedora"}</p>
                    {soEstorno ? (
                      <p className="text-xs text-muted-foreground">Sem vendas nesta competência</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Vendeu {brl(linha.totalVendas)}
                        {linha.percentualAplicado !== null && linha.percentualAplicado !== undefined
                          ? ` · ${linha.percentualAplicado}%`
                          : " · sem faixa atingida"}
                        {!!linha.valorBonus && ` · bônus ${brl(linha.valorBonus)}`}
                      </p>
                    )}
                    {!!linha.estornoPendente && (
                      <p className="text-xs text-destructive">
                        {soEstorno
                          ? `${brl(linha.estornoPendente)} de estorno esperando — segue pendente até ela voltar a vender`
                          : `${brl(linha.estornoPendente)} de estorno abatido (cancelamento de mês já pago)`}
                      </p>
                    )}
                    {soEstorno && podeBaixarEstorno && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() =>
                          setEstornoBaixando({
                            vendedoraId: linha.vendedoraId,
                            nome: linha.vendedoraNome ?? "a vendedora",
                            valor: linha.estornoPendente!,
                          })
                        }
                      >
                        Dar baixa
                      </Button>
                    )}
                    {linha.faltaProximoDegrau !== null && linha.faltaProximoDegrau !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Faltam {brl(linha.faltaProximoDegrau)} para o próximo degrau
                      </p>
                    )}
                    {/* E51: para onde o mês está indo, não só onde está. É o
                        que permite à dona da loja agir antes do dia 30. */}
                    {linha.projecao && (
                      <p className="text-xs text-muted-foreground" data-testid="projecao-linha">
                        No ritmo ({linha.projecao.diasDecorridos}/{linha.projecao.diasNoMes} dias):
                        {brl(linha.projecao.valorTotalProjetado)}
                        {linha.projecao.percentualProjetado !== null &&
                          linha.projecao.percentualProjetado !== undefined &&
                          ` na faixa de ${linha.projecao.percentualProjetado}%`}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-serif text-xl tabular-nums">
                    {brl(linha.valorTotal)}
                  </span>
                </li>
                );
              })}
              {/* E92/E13: "quanto vou pagar de comissão este mês?" é A pergunta
                  de gestão desta tela, e a única forma de ver a resposta era
                  clicar em "Fechar competência" e ler o texto do alerta — ou
                  seja, encostar o dedo no gatilho da ação que não se desfaz.
                  Mesmo tratamento do "Total de despesas" do DRE. */}
              <li className="flex items-center justify-between gap-4 pt-3">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  Total do mês
                </span>
                <span className="money-lg shrink-0">
                  {brl(resumoFechamento.total)}
                </span>
              </li>
            </ul>
          )}
        </CardContent>
      </Card>

      {/* — E52: o custo de comissão ao longo do tempo. O ranking acima é o mês;
          isto é a tendência, e a taxa efetiva é a pergunta que só aparece
          olhando vários meses juntos: "a comissão está comendo mais?". — */}
      {serie.pontos.length > 0 && (
        <Card data-testid="serie-comissao">
          <CardHeader>
            <CardTitle>Custo de comissão no tempo</CardTitle>
            <CardDescription>
              Meses já fechados — o que foi de fato pago, não previsão. Taxa efetiva do período:{" "}
              <span className="font-medium">
                {serie.taxaEfetivaMedia !== null ? `${serie.taxaEfetivaMedia}%` : "—"}
              </span>{" "}
              ({brl(serie.custoTotal)} sobre {brl(serie.totalVendas)} vendidos).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {serie.pontos.map((p) => (
                <li key={p.competencia} className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm">{capitalizar(rotuloCompetencia(p.competencia))}</span>
                    <span className="text-xs text-muted-foreground">
                      base {brl(p.totalVendas)} · {p.vendedoras}{" "}
                      {p.vendedoras === 1 ? "vendedora" : "vendedoras"}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {brl(p.custoComissao)}
                      {p.taxaEfetiva !== null && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.taxaEfetiva}%
                        </span>
                      )}
                    </span>
                  </div>
                  {/* A barra compara o CUSTO entre os meses (contra o maior),
                      não contra a base: a pergunta aqui é o tamanho da conta. */}
                  <div className="h-1.5 rounded-sm bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-sm bg-primary/60"
                      style={{ width: `${(p.custoComissao / maiorCusto) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* — Fechamentos da competência — */}
      {jaFechada && (
        <Card>
          <CardHeader>
            <CardTitle>Fechado</CardTitle>
            <CardDescription>
              A memória do cálculo: é isto que responde “por que este mês pagou isso?”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {fechamentosDaCompetencia.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {f.vendedoraNome ?? nomePorUsuario.get(f.vendedoraId) ?? "Vendedora"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Base {brl(f.totalVendas)}
                      {f.percentualAplicado !== null && f.percentualAplicado !== undefined && ` · ${f.percentualAplicado}%`}
                      {" · comissão "}{brl(f.valorComissao)}
                      {!!f.valorBonus && ` · bônus ${brl(f.valorBonus)}`}
                      {f.fechadoEm && ` · fechado em ${diaMesAno(f.fechadoEm)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-serif text-xl tabular-nums">{brl(f.valorTotal)}</span>
                    {/* E54: fechou errado, dá para desfazer sem SQL. Só admin —
                        a mesma régua da baixa de estorno, que também mexe em
                        dinheiro já apurado. */}
                    {podeMexerNaComissao && (
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`reabrir-${f.id}`}
                        onClick={() =>
                          setFechamentoReabrindo({
                            id: f.id,
                            nome: f.vendedoraNome ?? nomePorUsuario.get(f.vendedoraId) ?? "a vendedora",
                            valor: f.valorTotal,
                          })
                        }
                      >
                        Reabrir
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Reabrir apaga registro de dinheiro apurado: a confirmação diz o que
          some, e não só "tem certeza?". */}
      <AlertDialog
        open={!!fechamentoReabrindo}
        onOpenChange={(aberto) => !aberto && setFechamentoReabrindo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir o fechamento de {fechamentoReabrindo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O fechamento de {rotuloCompetencia(competencia)} some, e com ele a conta a pagar de{" "}
              {brl(fechamentoReabrindo?.valor ?? 0)}. Estornos que este mês tinha reconciliado voltam
              a pendentes. A competência fica aberta para ser fechada de novo, e a reabertura fica
              registrada na trilha de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onReabrirFechamento} disabled={reabrirFechamento.isPending}>
              {reabrirFechamento.isPending ? "Reabrindo…" : "Reabrir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* — Baixas de estorno — só existe se alguma foi feita. O rastro do I10
          visível: quem baixou, quando e por quê. */}
      {(baixas.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Baixas de estorno</CardTitle>
            <CardDescription>
              Estornos baixados à mão — o valor deixou de carregar por decisão registrada, não por venda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {baixas.data?.map((b) => (
                <li key={b.contratoId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{b.vendedoraNome ?? "Vendedora"}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.noivaNome && `Contrato de ${b.noivaNome} · `}
                      baixado por {b.baixadoPorNome ?? "—"}
                      {b.baixadoEm && ` em ${diaMesAno(b.baixadoEm)}`}
                      {b.motivo && ` · ${b.motivo}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-serif text-xl tabular-nums text-destructive">
                    {brl(b.valor)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* — Escada por vendedora — */}
      <Card>
        <CardHeader>
          <CardTitle>Regras de comissão</CardTitle>
          <CardDescription>
            Cada vendedora tem a sua escada, versionada no tempo: redefinir cria uma versão nova e
            as antigas ficam na linha do tempo — é aí que se responde “por que março pagou
            diferente?”. Um intervalo sem faixa não comissiona — é assim que se diz “abaixo disso
            não paga”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {regras.isError ? (
            <ErroListagem mensagem="Falha ao buscar as regras." onRetry={() => regras.refetch()} />
          ) : regras.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (regras.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra definida — sem regra, não há comissão.
            </p>
          ) : (
            <ul className="space-y-6">
              {linhaDoTempo.map((vendedora) => (
                <li key={vendedora.vendedoraId} className="space-y-2">
                  <p className="font-medium">{vendedora.nome}</p>
                  {/* Linha do tempo da escada (E17): mais recente no topo. */}
                  <ol className="space-y-2 border-l pl-4">
                    {vendedora.versoes.map((regra, i) => {
                      const inicio = new Date(regra.vigenciaInicio);
                      const futura = inicio.getTime() > Date.now();
                      const vigente = regra.id === vendedora.vigenteId;
                      // A versão acima (mais recente) encerra esta na véspera.
                      const sucessora = i > 0 ? vendedora.versoes[i - 1] : null;
                      const fim = sucessora
                        ? new Date(new Date(sucessora.vigenciaInicio).getTime() - 86_400_000)
                        : null;
                      return (
                        <li
                          key={regra.id}
                          className={`rounded-lg border p-3 ${vigente ? "" : "opacity-80"}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              {vigente ? (
                                <>
                                  <Badge className="mr-2 font-normal">vigente</Badge>
                                  desde {diaMesAno(inicio)}
                                </>
                              ) : futura ? (
                                <>
                                  <Badge variant="secondary" className="mr-2 font-normal">
                                    futura
                                  </Badge>
                                  entra em vigor em {diaMesAno(inicio)}
                                </>
                              ) : !regra.ativo ? (
                                <>
                                  <Badge variant="outline" className="mr-2 font-normal">
                                    inativa
                                  </Badge>
                                  definida para {diaMesAno(inicio)}
                                </>
                              ) : (
                                <>
                                  valeu de {diaMesAno(inicio)}
                                  {fim ? ` a ${diaMesAno(fim)}` : ""}
                                </>
                              )}
                              {regra.bonusAcumulaFaixas && " · bônus acumulam"}
                            </p>
                            {podeMexerNaComissao && (<span className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              disabled={atualizarRegra.isPending}
                              onClick={() => onAlternarRegra(regra.id, !regra.ativo)}
                              data-testid={`alternar-regra-${regra.id}`}
                            >
                              {regra.ativo ? "Desativar" : "Reativar"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remover a versão de ${diaMesAno(inicio)} de ${vendedora.nome}`}
                              disabled={removerRegra.isPending}
                              onClick={() =>
                                setRegraRemovendo({ id: regra.id, nome: vendedora.nome })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            </span>)}
                          </div>
                          <ul className="mt-1 space-y-1">
                            {regra.faixas.map((f) => (
                              <li key={f.id} className="text-sm tabular-nums text-muted-foreground">
                                {descreverFaixa(f)}
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ul>
          )}

          {/* — Nova regra — */}
          {podeCriarRegra && (
          <div className="space-y-3 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Definir regra</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Vendedora</Label>
                <Select value={vendedoraId} onValueChange={setVendedoraId}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipe.data?.map((m) => (
                      <SelectItem key={m.usuarioId} value={m.usuarioId}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Checkbox
                  checked={bonusAcumula}
                  onCheckedChange={(v) => setBonusAcumula(v === true)}
                  aria-label="Bônus dos degraus se somam"
                />
                Bônus dos degraus se somam
              </label>
            </div>

            <div className="space-y-2">
              {faixas.map((f, i) => (
                <div key={f.id} className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">De (R$)</Label>
                    <Input
                      className="w-32"
                      inputMode="decimal"
                      value={f.minAcumulado}
                      onChange={(e) => atualizarFaixa(i, "minAcumulado", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Até (R$)</Label>
                    <Input
                      className="w-32"
                      inputMode="decimal"
                      value={f.maxAcumulado}
                      onChange={(e) => atualizarFaixa(i, "maxAcumulado", e.target.value)}
                      placeholder="sem teto"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">%</Label>
                    <Input
                      className="w-20"
                      inputMode="decimal"
                      value={f.percentual}
                      onChange={(e) => atualizarFaixa(i, "percentual", e.target.value)}
                      placeholder="5"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Bônus (R$)</Label>
                    <Input
                      className="w-28"
                      inputMode="decimal"
                      value={f.bonusFixo}
                      onChange={(e) => atualizarFaixa(i, "bonusFixo", e.target.value)}
                      placeholder="—"
                    />
                  </div>
                  {faixas.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover faixa ${i + 1}`}
                      onClick={() => setFaixas((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFaixas((prev) => [...prev, faixaVazia()])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar faixa
              </Button>
              {/* E23: testa a escada digitada contra as bases reais, sem gravar. */}
              <Button variant="outline" size="sm" onClick={onSimular} disabled={simular.isPending}>
                <FlaskConical className="mr-1 h-4 w-4" />
                {simular.isPending ? "Simulando…" : "Simular últimos 3 meses"}
              </Button>
              <Button size="sm" onClick={onSalvarRegra} disabled={criarRegra.isPending}>
                {criarRegra.isPending ? "Salvando…" : "Salvar regra"}
              </Button>
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* — Resultado da simulação (E23) — */}
      <Dialog open={!!simulacao} onOpenChange={(aberto) => !aberto && setSimulacao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Se a escada fosse esta —{" "}
              {simulacao ? (nomePorUsuario.get(simulacao.vendedoraId) ?? "vendedora") : ""}
            </DialogTitle>
            <DialogDescription>
              A escada digitada aplicada às vendas reais dos últimos meses, pelo mesmo motor do
              fechamento. Mês fechado compara com o que foi pago de verdade; mês aberto, com o que a
              regra vigente pagaria. Nada é gravado.
            </DialogDescription>
          </DialogHeader>
          {simulacao && (
            <div className="space-y-3">
              {/* E19/E99 — a única das cinco tabelas com dor MEDIDA: ela vive
                  num `DialogContent max-w-lg` e não tinha contêiner de rolagem
                  nenhum entre os dois. Cinco colunas de dinheiro num diálogo
                  estreito eram cortadas sem saída. O `<Table>` embrulha num
                  `div.relative.w-full.overflow-auto` — é esse wrapper o ganho,
                  não a marcação. */}
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="text-left text-xs text-muted-foreground hover:bg-transparent">
                    <TableHead className="h-auto py-1.5 pl-0 pr-2 font-normal">Mês</TableHead>
                    <TableHead className="h-auto px-2 py-1.5 text-right font-normal">Vendas</TableHead>
                    <TableHead className="h-auto px-2 py-1.5 text-right font-normal">Pago</TableHead>
                    <TableHead className="h-auto px-2 py-1.5 text-right font-normal">Simulado</TableHead>
                    <TableHead className="h-auto py-1.5 pl-2 pr-0 text-right font-normal">Diferença</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulacao.linhas.map((l) => (
                    <TableRow key={l.competencia} className="last:border-0 hover:bg-transparent">
                      <TableCell className="py-1.5 pl-0 pr-2">
                        {capitalizar(rotuloCompetencia(l.competencia))}
                        {!l.fechada && (
                          <span className="ml-1 text-xs text-muted-foreground">(sem fechamento)</span>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums">{brl(l.base)}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums">{brl(l.pagoReal)}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums">{brl(l.simulado)}</TableCell>
                      <TableCell
                        className={`py-1.5 pl-2 pr-0 text-right tabular-nums ${
                          l.diferenca > 0 ? "text-destructive" : l.diferenca < 0 ? "text-positivo" : ""
                        }`}
                      >
                        {l.diferenca > 0 ? "+" : ""}{brl(l.diferenca)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="bg-transparent">
                  <TableRow className="font-medium hover:bg-transparent">
                    <TableCell className="py-2 pl-0 pr-2">Total</TableCell>
                    <TableCell />
                    <TableCell className="px-2 py-2 text-right tabular-nums">{brl(simulacao.totalPagoReal)}</TableCell>
                    <TableCell className="px-2 py-2 text-right tabular-nums">{brl(simulacao.totalSimulado)}</TableCell>
                    <TableCell
                      className={`py-2 pl-2 pr-0 text-right tabular-nums ${
                        simulacao.totalDiferenca > 0
                          ? "text-destructive"
                          : simulacao.totalDiferenca < 0
                            ? "text-positivo"
                            : ""
                      }`}
                    >
                      {simulacao.totalDiferenca > 0 ? "+" : ""}{brl(simulacao.totalDiferenca)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
              <p className="text-xs text-muted-foreground">
                Diferença positiva = a escada nova teria pago MAIS do que foi pago.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!estornoBaixando}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setEstornoBaixando(null);
            setMotivoBaixa("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Dar baixa em {estornoBaixando ? brl(estornoBaixando.valor) : ""} de {estornoBaixando?.nome}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O estorno deixa de carregar para os próximos meses. Use quando a vendedora
              não vai mais vender e o valor não será recuperado por venda futura. Fica no
              registro quem baixou. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-baixa" className="text-xs text-muted-foreground">
              Motivo (opcional)
            </Label>
            <Input
              id="motivo-baixa"
              value={motivoBaixa}
              onChange={(e) => setMotivoBaixa(e.target.value)}
              placeholder="Ex.: acordo com a vendedora, desligamento…"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onBaixarEstorno} disabled={baixarEstorno.isPending}>
              {baixarEstorno.isPending ? "Baixando…" : "Dar baixa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!regraRemovendo} onOpenChange={(aberto) => !aberto && setRegraRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a escada de {regraRemovendo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sem regra, esta vendedora não comissiona nos próximos fechamentos. Os
              fechamentos já feitos não mudam. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRemoverRegra} disabled={removerRegra.isPending}>
              {removerRegra.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
