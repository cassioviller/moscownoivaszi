/**
 * Contas a pagar — a carteira de saída: despesas, fornecedores e a folha.
 *
 * Uma saída de caixa pode quitar N contas: a seleção múltipla monta um único
 * `createPagamento({ contaIds })`, e o backend rateia o valor pago entre os
 * itens (`pagamento_itens`) mantendo sum(itens.valor) === valorPago. Pagar uma
 * conta sozinha é o mesmo caminho com `contaIds` de tamanho 1 — não existe rota
 * "single" nesta tela, para que todo pagamento tenha um `pagamentoId` estornável.
 *
 * E93/D2: a tela pede a JANELA que ela mostra (`{de, ate}` por vencimento) e
 * nada mais. Ela baixava a carteira inteira de contas E a de pagamentos — esta
 * segunda só para achar o `pagamentoId` que torna a saída estornável, porque o
 * `listContasPagar` não o devolvia. Agora devolve (`conta.pagamento`), com a
 * fatia RATEADA e quantas contas a mesma saída quitou, e o segundo request
 * simplesmente deixou de existir. Recortar `listPagamentos` pela janela de
 * VENCIMENTOS não era opção: a saída que quita uma conta de julho pode ter
 * data de agosto (atraso) ou de junho (adiantamento), e perdê-la fazia o botão
 * "Estornar pagamento" sumir e o card "Pago" cair para o previsto — em
 * silêncio, numa tela de dinheiro.
 *
 * As contas SALARIO aparecem aqui como qualquer outra, mas nascem na tela
 * irmã (financeiro/folha): é lá que o salário-base vira folha da competência
 * e que o período fecha com a contabilidade.
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListContasPagar,
  getListContasPagarQueryKey,
  useCreatePagamento,
  useEstornarPagamento,
  useCreateContaPagar,
  useRemoveContaPagar,
  useListEquipe,
  getListEquipeQueryKey,
  getExportarContasPagarUrl,
  type ContaPagar,
  type ContaPagarTipo,
  type ContaPagarInputTipo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
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
import { ROTULO_FORMA, FORMAS, rotuloForma, estaAtrasada, vencidas } from "@/lib/financeiro/forma";
import { hojeLocal, resolverIntervalo, negocioNoIntervalo } from "@/lib/financeiro/datas";
import { parseValor, reais, centavos, somaCentavos } from "@/lib/financeiro/dinheiro";
import { ResumoCard, dataFmt, invalidarCaixa } from "./helpers";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import { mensagemApi } from "@/lib/erro-api";
import { CACHE_ESTAVEL } from "@/lib/cache";

const MENSAGENS_ERRO: Record<string, string> = {
  CONTA_JA_PAGA: "Conta já paga — estorne o pagamento antes.",
  CONTA_NAO_ENCONTRADA: "Alguma conta não existe mais nesta loja.",
  // B8/E94: a conta de comissão se desfaz reabrindo o fechamento que a criou —
  // apagá-la por aqui zerava o vínculo em silêncio e a vendedora não recebia.
  CONTA_DE_COMISSAO: "Esta conta veio de um fechamento de comissão — reabra o fechamento em Comissões para desfazê-la.",
  PAGAMENTO_NAO_ENCONTRADO: "Pagamento não encontrado.",
  INTERVALO_INVALIDO: "Intervalo inválido.",
};


const TIPO_ROTULO: Record<ContaPagarTipo, string> = {
  DESPESA: "Despesa",
  FORNECEDOR: "Fornecedor",
  SALARIO: "Salário",
  COMISSAO: "Comissão",
};

const FILTROS = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "atrasadas", rotulo: "Atrasadas" },
  { chave: "pagas", rotulo: "Pagas" },
  { chave: "todas", rotulo: "Todas" },
] as const;

type FiltroPagar = (typeof FILTROS)[number]["chave"];



export default function Pagar() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const caminho = useCaminhoDaLoja();
  const [searchParams, setSearchParams] = useSearchParams();

  const filtro = (FILTROS.find((f) => f.chave === searchParams.get("filtro"))?.chave ??
    "abertas") as FiltroPagar;
  const intervalo = resolverIntervalo(searchParams.get("ini"), searchParams.get("fim"));

  // Seleção para a saída multi-conta
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [pagarOpen, setPagarOpen] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(hojeLocal());
  const [valorPago, setValorPago] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");

  // Lançar conta
  const [novaOpen, setNovaOpen] = useState(false);
  const [tipo, setTipo] = useState<ContaPagarInputTipo>("DESPESA");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valorPrevisto, setValorPrevisto] = useState("");
  const [vencimento, setVencimento] = useState(hojeLocal());

  // Confirmações
  const [contaRemover, setContaRemover] = useState<ContaPagar | null>(null);
  const [pagamentoEstornar, setPagamentoEstornar] = useState<{ pagamentoId: string; contas: number } | null>(null);

  // D2: o recorte acontece no SERVIDOR; o filtro client-side abaixo permanece
  // como cinto de segurança da mesma regra.
  const janelaVencimento = { de: intervalo.iniYMD, ate: intervalo.fimYMD };
  const contas = useListContasPagar(activeLojaId!, janelaVencimento, {
    query: {
      queryKey: getListContasPagarQueryKey(activeLojaId!, janelaVencimento),
      enabled: !!activeLojaId,
    },
  });
  const equipe = useListEquipe(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const criarPagamento = useCreatePagamento();
  const estornarPagamento = useEstornarPagamento();
  const criarConta = useCreateContaPagar();
  const removerConta = useRemoveContaPagar();

  const hoje = hojeLocal();

  const atualizarParams = (patch: Record<string, string>) => {
    const proximo = new URLSearchParams(searchParams);
    for (const [chave, valor] of Object.entries(patch)) {
      if (valor) proximo.set(chave, valor);
      else proximo.delete(chave);
    }
    setSearchParams(proximo, { replace: true });
  };

  const nomePorUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const membro of equipe.data ?? []) mapa.set(membro.usuarioId, membro.nome);
    return mapa;
  }, [equipe.data]);

  const naJanela = useMemo(
    () => (contas.data ?? []).filter((c) => negocioNoIntervalo(c.vencimento, intervalo)),
    [contas.data, intervalo.iniYMD, intervalo.fimYMD],
  );

  const resumo = useMemo(() => {
    const previstas = naJanela.filter((c) => c.status === "PREVISTA");
    const pagas = naJanela.filter((c) => c.status === "PAGA");
    return {
      aPagar: reais(somaCentavos(previstas, (c) => c.valorPrevisto)),
      // O que saiu do caixa é a fatia rateada, não o previsto: com valorPago
      // divergente as duas coisas diferem, e o fluxo/DRE contam a rateada.
      // O servidor manda a fatia junto com a conta (D2), então o fallback para
      // o previsto virou só a rede de segurança de uma conta PAGA sem item.
      pago: reais(somaCentavos(pagas, (c) => c.pagamento?.valor ?? c.valorPrevisto)),
      emAtraso: vencidas(naJanela, hoje).total,
    };
  }, [naJanela, hoje]);

  const lista = useMemo(() => {
    const filtrada = naJanela.filter((c) => {
      if (filtro === "abertas") return c.status === "PREVISTA";
      if (filtro === "atrasadas") return estaAtrasada(c, hoje);
      if (filtro === "pagas") return c.status === "PAGA";
      return true;
    });
    return filtrada.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [naJanela, filtro, hoje]);

  // A seleção só vale para o que ainda está PREVISTO e visível no filtro atual:
  // pagar uma conta que saiu da lista seria uma saída de caixa às cegas.
  const selecionaveis = useMemo(
    () => lista.filter((c) => c.status === "PREVISTA"),
    [lista],
  );
  const contasSelecionadas = useMemo(
    () => selecionaveis.filter((c) => selecionadas.includes(c.id)),
    [selecionaveis, selecionadas],
  );
  const totalSelecionadoCentavos = useMemo(
    () => somaCentavos(contasSelecionadas, (c) => c.valorPrevisto),
    [contasSelecionadas],
  );

  // D9: a saída de caixa muda o fluxo, o DRE e o alerta tanto quanto muda esta
  // lista — invalidar só os dois lados da própria operação deixava o número do
  // dashboard e do sino velho. Ver `lib/financeiro/cache.ts`.
  const invalidarTudo = () => invalidarCaixa(queryClient, activeLojaId!);

  const alternarSelecao = (contaId: string) =>
    setSelecionadas((atual) =>
      atual.includes(contaId) ? atual.filter((id) => id !== contaId) : [...atual, contaId],
    );

  const todasSelecionadas =
    selecionaveis.length > 0 && contasSelecionadas.length === selecionaveis.length;

  const abrirPagar = (ids: string[]) => {
    setSelecionadas(ids);
    const total = somaCentavos(
      selecionaveis.filter((c) => ids.includes(c.id)),
      (c) => c.valorPrevisto,
    );
    setValorPago(reais(total).toFixed(2).replace(".", ","));
    setDataPagamento(hojeLocal());
    setFormaPagamento("");
    setObservacoes("");
    setPagarOpen(true);
  };

  const onPagar = async () => {
    if (contasSelecionadas.length === 0) {
      toast({ title: "Selecione ao menos uma conta", variant: "destructive" });
      return;
    }
    // Zero não é pagamento: quitaria a dívida sem dinheiro nenhum ter saído,
    // e só o estorno desfaz. Mesma régua do lançamento de conta.
    const valor = parseValor(valorPago);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      toast({ title: "Valor pago inválido", variant: "destructive" });
      return;
    }
    if (!dataPagamento) {
      toast({ title: "Informe a data do pagamento", variant: "destructive" });
      return;
    }
    // `data` do pagamento é um INSTANTE: hoje usa o agora real; um dia passado
    // ancora ao meio-dia de São Paulo para cair no dia local certo.
    const instante =
      dataPagamento === hojeLocal() ? new Date().toISOString() : diaParaISO(dataPagamento);
    try {
      await criarPagamento.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          data: instante,
          contaIds: contasSelecionadas.map((c) => c.id),
          valorPago: valor,
          ...(formaPagamento ? { forma: formaPagamento } : {}),
          ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
        },
      });
      await invalidarTudo();
      toast({
        title: contasSelecionadas.length > 1 ? "Pagamento registrado" : "Conta paga",
        description:
          contasSelecionadas.length > 1
            ? `Uma saída de ${brl(valor)} quitou ${contasSelecionadas.length} contas.`
            : undefined,
      });
      setPagarOpen(false);
      setSelecionadas([]);
    } catch (err) {
      toast({
        title: "Erro ao pagar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const onCriarConta = async () => {
    if (!descricao.trim()) {
      toast({ title: "Informe uma descrição", variant: "destructive" });
      return;
    }
    const valor = parseValor(valorPrevisto);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      toast({ title: "Valor previsto inválido", variant: "destructive" });
      return;
    }
    if (!vencimento) {
      toast({ title: "Informe o vencimento", variant: "destructive" });
      return;
    }
    try {
      await criarConta.mutateAsync({
        lojaId: activeLojaId!,
        data: {
          tipo,
          descricao: descricao.trim(),
          ...(categoria.trim() ? { categoria: categoria.trim() } : {}),
          ...(fornecedor.trim() ? { fornecedor: fornecedor.trim() } : {}),
          valorPrevisto: valor,
          vencimento: diaParaISO(vencimento),
        },
      });
      await invalidarTudo();
      toast({ title: "Conta lançada" });
      setNovaOpen(false);
      setDescricao("");
      setCategoria("");
      setFornecedor("");
      setValorPrevisto("");
      setVencimento(hojeLocal());
    } catch (err) {
      toast({
        title: "Erro ao lançar a conta",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const onRemoverConta = async () => {
    if (!contaRemover) return;
    try {
      await removerConta.mutateAsync({ lojaId: activeLojaId!, contaId: contaRemover.id });
      await invalidarTudo();
      setSelecionadas((atual) => atual.filter((id) => id !== contaRemover.id));
      toast({ title: "Conta removida" });
      setContaRemover(null);
    } catch (err) {
      toast({
        title: "Erro ao remover",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const onEstornarPagamento = async () => {
    if (!pagamentoEstornar) return;
    try {
      await estornarPagamento.mutateAsync({
        lojaId: activeLojaId!,
        pagamentoId: pagamentoEstornar.pagamentoId,
      });
      await invalidarTudo();
      toast({
        title: "Pagamento estornado",
        description:
          pagamentoEstornar.contas > 1
            ? `As ${pagamentoEstornar.contas} contas da saída voltaram para em aberto.`
            : undefined,
      });
      setPagamentoEstornar(null);
    } catch (err) {
      toast({
        title: "Erro ao estornar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const detalheConta = (c: ContaPagar) => {
    const quem = c.colaboradorId ? nomePorUsuario.get(c.colaboradorId) : null;
    return quem ?? c.fornecedor ?? c.categoria ?? null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">
            O que sai do caixa: despesas, fornecedores e a folha do atelier.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Salário-base e geração da folha vivem na tela irmã: aqui é a
              carteira inteira; lá, o recorte mensal do atelier. */}
          <Button variant="outline" asChild>
            <Link to={caminho("/financeiro/folha")}>Folha do mês</Link>
          </Button>
          <Button variant="outline" onClick={() => setNovaOpen(true)}>
            Lançar despesa
          </Button>
          {/* Download nativo do CSV da janela em vista — a contadora importa
              sem redigitar. <a> em vez de fetch: o navegador cuida do arquivo. */}
          <Button variant="outline" asChild>
            <a
              href={getExportarContasPagarUrl(activeLojaId!, {
                de: intervalo.iniYMD,
                ate: intervalo.fimYMD,
              })}
              download
            >
              Exportar CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ini">De</Label>
          <Input
            id="ini"
            type="date"
            className="w-40"
            value={intervalo.iniYMD}
            onChange={(e) => atualizarParams({ ini: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fim">Até</Label>
          <Input
            id="fim"
            type="date"
            className="w-40"
            value={intervalo.fimYMD}
            onChange={(e) => atualizarParams({ fim: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <ResumoCard rotulo="A pagar" valor={resumo.aPagar} />
        <ResumoCard rotulo="Pago" valor={resumo.pago} />
        <ResumoCard rotulo="Em atraso" valor={resumo.emAtraso} destaque />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.chave}
            size="sm"
            variant={f.chave === filtro ? "default" : "outline"}
            onClick={() => {
              setSelecionadas([]);
              atualizarParams({ filtro: f.chave });
            }}
          >
            {f.rotulo}
          </Button>
        ))}
      </div>

      {contasSelecionadas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm">
            {contasSelecionadas.length}{" "}
            {contasSelecionadas.length === 1 ? "conta selecionada" : "contas selecionadas"} ·{" "}
            {brl(reais(totalSelecionadoCentavos))}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelecionadas([])}>
              Limpar
            </Button>
            <Button size="sm" onClick={() => abrirPagar(contasSelecionadas.map((c) => c.id))}>
              Pagar {contasSelecionadas.length > 1 ? "juntas" : "conta"}
            </Button>
          </div>
        </div>
      )}

      {contas.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar as contas.</span>
            <Button variant="outline" size="sm" onClick={() => contas.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : contas.isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada por aqui neste filtro.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            {selecionaveis.length > 0 && (
              <div className="flex items-center gap-3 border-b px-4 py-2">
                <Checkbox
                  id="todas"
                  checked={todasSelecionadas}
                  onCheckedChange={(marcado) =>
                    setSelecionadas(marcado ? selecionaveis.map((c) => c.id) : [])
                  }
                />
                <Label htmlFor="todas" className="text-xs text-muted-foreground">
                  Selecionar todas as abertas desta lista
                </Label>
              </div>
            )}
            <div className="divide-y">
              {lista.map((c) => {
                const atrasada = estaAtrasada(c, hoje);
                const detalhe = detalheConta(c);
                const pagamento = c.pagamento;
                return (
                  <div key={c.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {c.status === "PREVISTA" && (
                          <Checkbox
                            className="mt-1"
                            aria-label={`Selecionar ${c.descricao}`}
                            checked={selecionadas.includes(c.id)}
                            onCheckedChange={() => alternarSelecao(c.id)}
                          />
                        )}
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{c.descricao}</span>
                          <span className="text-xs text-muted-foreground">
                            {TIPO_ROTULO[c.tipo]}
                            {detalhe ? ` · ${detalhe}` : ""} · vence{" "}
                            {dataFmt.format(new Date(c.vencimento))}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.status === "PAGA" ? (
                          <Badge variant="default">
                            Paga
                            {pagamento?.forma ? ` (${rotuloForma(pagamento.forma)})` : ""}
                          </Badge>
                        ) : atrasada ? (
                          <Badge variant="destructive">Atrasada</Badge>
                        ) : (
                          <Badge variant="secondary">Prevista</Badge>
                        )}
                        <span className={`font-serif tabular-nums ${atrasada ? "text-destructive" : ""}`}>
                          {brl(c.valorPrevisto)}
                        </span>
                      </div>
                    </div>

                    {c.status === "PREVISTA" && (
                      <div className="flex justify-end gap-2 border-t pt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removerConta.isPending}
                          onClick={() => setContaRemover(c)}
                        >
                          Remover
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => abrirPagar([c.id])}>
                          Pagar
                        </Button>
                      </div>
                    )}
                    {c.status === "PAGA" && pagamento && (
                      <div className="flex items-center justify-end gap-3 border-t pt-2">
                        {pagamento.contas > 1 && (
                          <span className="text-xs text-muted-foreground">
                            Saída conjunta de {pagamento.contas} contas
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={estornarPagamento.isPending}
                          onClick={() =>
                            setPagamentoEstornar({
                              pagamentoId: pagamento.id,
                              contas: pagamento.contas,
                            })
                          }
                        >
                          Estornar pagamento
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={pagarOpen} onOpenChange={setPagarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {contasSelecionadas.length > 1
                ? `Pagar ${contasSelecionadas.length} contas numa saída`
                : "Registrar pagamento"}
            </DialogTitle>
            <DialogDescription>
              {contasSelecionadas.length > 1
                ? "Uma única saída de caixa quita as contas selecionadas; um valor menor que o previsto é rateado proporcionalmente entre elas."
                : "A saída de caixa fica estornável a qualquer momento."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
              {contasSelecionadas.map((c) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span className="truncate">{c.descricao}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {brl(c.valorPrevisto)}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t pt-1 font-medium">
                <span>Previsto</span>
                <span className="tabular-nums">{brl(reais(totalSelecionadoCentavos))}</span>
              </li>
            </ul>
            <div className="space-y-1">
              <Label htmlFor="valorPago">Valor pago</Label>
              <Input
                id="valorPago"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                placeholder="0,00"
              />
              {(() => {
                const valor = parseValor(valorPago);
                if (valor === null || Number.isNaN(valor)) return null;
                const diff = totalSelecionadoCentavos - centavos(valor);
                if (diff === 0) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    {diff > 0 ? "Desconto" : "Acréscimo"} de {brl(reais(Math.abs(diff)))} sobre o
                    previsto.
                  </p>
                );
              })()}
            </div>
            <div className="space-y-1">
              <Label htmlFor="dataPagamento">Data</Label>
              <Input
                id="dataPagamento"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="formaPagamento">Forma</Label>
              <Select value={formaPagamento || undefined} onValueChange={setFormaPagamento}>
                <SelectTrigger id="formaPagamento">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {ROTULO_FORMA[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Opcional"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagarOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onPagar} disabled={criarPagamento.isPending}>
              {criarPagamento.isPending ? "Registrando…" : "Registrar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar despesa</DialogTitle>
            <DialogDescription>
              Salários e comissões nascem na folha do mês — aqui vão despesas e fornecedores.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as ContaPagarInputTipo)}>
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="FORNECEDOR">Fornecedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="descricao">Descrição</Label>
              <Input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="categoria">Categoria</Label>
                <Input
                  id="categoria"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  placeholder="Aluguel…"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <Input
                  id="fornecedor"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="valorPrevisto">Valor previsto</Label>
                <Input
                  id="valorPrevisto"
                  value={valorPrevisto}
                  onChange={(e) => setValorPrevisto(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="vencimento">Vencimento</Label>
                <Input
                  id="vencimento"
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onCriarConta} disabled={criarConta.isPending}>
              {criarConta.isPending ? "Lançando…" : "Lançar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!contaRemover} onOpenChange={(aberto) => !aberto && setContaRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta conta?</AlertDialogTitle>
            <AlertDialogDescription>
              {contaRemover?.descricao} sai da carteira de contas a pagar. Só contas em aberto podem
              ser removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRemoverConta} disabled={removerConta.isPending}>
              {removerConta.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pagamentoEstornar}
        onOpenChange={(aberto) => !aberto && setPagamentoEstornar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar este pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {pagamentoEstornar && pagamentoEstornar.contas > 1
                ? `A saída de caixa some e as ${pagamentoEstornar.contas} contas que ela quitou voltam para em aberto.`
                : "A saída de caixa some e a conta volta para em aberto."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onEstornarPagamento} disabled={estornarPagamento.isPending}>
              {estornarPagamento.isPending ? "Estornando…" : "Estornar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
