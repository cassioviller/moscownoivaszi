import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListComissaoRegras,
  getListComissaoRegrasQueryKey,
  useCreateComissaoRegra,
  useDeleteComissaoRegra,
  useListComissaoFechamentos,
  getListComissaoFechamentosQueryKey,
  usePreviewComissao,
  getPreviewComissaoQueryKey,
  useGerarComissaoFechamento,
  getListContasPagarQueryKey,
  useListEquipe,
  getListEquipeQueryKey,
  type ComissaoFaixa,
  type ComissaoRegra,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { brl } from "@/lib/formatos";
import { competenciaAtual, ultimasCompetencias } from "@/lib/financeiro/datas";
import { parseValor } from "@/lib/financeiro/dinheiro";
import { ErroListagem, mensagemApi } from "@/pages/financeiro/helpers";

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

const mesFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const rotuloCompetencia = (c: string) => mesFmt.format(new Date(`${c}-01T12:00:00.000Z`));

const diaFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** Uma faixa em edição — strings, porque vêm do teclado. */
type FaixaForm = { minAcumulado: string; maxAcumulado: string; percentual: string; bonusFixo: string };

const FAIXA_VAZIA: FaixaForm = { minAcumulado: "", maxAcumulado: "", percentual: "", bonusFixo: "" };

function descreverFaixa(f: ComissaoFaixa): string {
  const ate = f.maxAcumulado === null || f.maxAcumulado === undefined
    ? "acima"
    : `até R$ ${brl(f.maxAcumulado)}`;
  const paga = [
    f.percentual ? `${f.percentual}%` : null,
    f.bonusFixo ? `+ R$ ${brl(f.bonusFixo)}` : null,
  ].filter(Boolean).join(" ");
  return `De R$ ${brl(f.minAcumulado)} ${ate} → ${paga}`;
}

export default function Comissoes() {
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const competencia = searchParams.get("competencia") ?? competenciaAtual();

  const regras = useListComissaoRegras(activeLojaId!, {
    query: { queryKey: getListComissaoRegrasQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const equipe = useListEquipe(activeLojaId!, {
    query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const paramsPreview = { competencia };
  const preview = usePreviewComissao(activeLojaId!, paramsPreview, {
    query: {
      queryKey: getPreviewComissaoQueryKey(activeLojaId!, paramsPreview),
      enabled: !!activeLojaId,
    },
  });
  const paramsFech = { competencia };
  const fechamentos = useListComissaoFechamentos(activeLojaId!, paramsFech, {
    query: {
      queryKey: getListComissaoFechamentosQueryKey(activeLojaId!, paramsFech),
      enabled: !!activeLojaId,
    },
  });

  const criarRegra = useCreateComissaoRegra();
  const removerRegra = useDeleteComissaoRegra();
  const gerarFechamento = useGerarComissaoFechamento();

  const [vendedoraId, setVendedoraId] = useState("");
  const [bonusAcumula, setBonusAcumula] = useState(false);
  const [faixas, setFaixas] = useState<FaixaForm[]>([{ ...FAIXA_VAZIA }]);

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

  async function onSalvarRegra() {
    if (!vendedoraId) {
      toast({ title: "Escolha a vendedora", variant: "destructive" });
      return;
    }
    // Vazio e lixo são coisas diferentes: em branco é "sem teto"/"não paga",
    // texto inválido é engano de digitação e não pode virar 0 silenciosamente.
    const convertidas = [];
    for (const f of faixas) {
      const min = parseValor(f.minAcumulado);
      const max = parseValor(f.maxAcumulado);
      const pct = parseValor(f.percentual);
      const bonus = parseValor(f.bonusFixo);
      if (min === null || Number.isNaN(min) || [max, pct, bonus].some((v) => v !== null && Number.isNaN(v))) {
        toast({ title: "Há valor inválido nas faixas", variant: "destructive" });
        return;
      }
      convertidas.push({ minAcumulado: min, maxAcumulado: max, percentual: pct, bonusFixo: bonus });
    }

    try {
      await criarRegra.mutateAsync({
        lojaId: activeLojaId!,
        data: { vendedoraId, bonusAcumulaFaixas: bonusAcumula, faixas: convertidas },
      });
      await queryClient.invalidateQueries({ queryKey: getListComissaoRegrasQueryKey(activeLojaId!) });
      await queryClient.invalidateQueries({ queryKey: getPreviewComissaoQueryKey(activeLojaId!, paramsPreview) });
      setFaixas([{ ...FAIXA_VAZIA }]);
      setVendedoraId("");
      setBonusAcumula(false);
      toast({ title: "Regra salva" });
    } catch (err) {
      const e = err as { data?: { error?: string; detalhe?: string } };
      const detalhe = e?.data?.error === "FAIXAS_INVALIDAS" ? MOTIVO_FAIXA[e.data.detalhe ?? ""] : undefined;
      toast({
        title: "Erro ao salvar a regra",
        description: detalhe ?? mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function onRemoverRegra(regraId: string) {
    try {
      await removerRegra.mutateAsync({ lojaId: activeLojaId!, regraId });
      await queryClient.invalidateQueries({ queryKey: getListComissaoRegrasQueryKey(activeLojaId!) });
      toast({ title: "Regra removida" });
    } catch (err) {
      toast({
        title: "Erro ao remover",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  async function onGerarFechamento() {
    try {
      const criados = await gerarFechamento.mutateAsync({ lojaId: activeLojaId!, data: { competencia } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListComissaoFechamentosQueryKey(activeLojaId!, paramsFech) }),
        queryClient.invalidateQueries({ queryKey: getListContasPagarQueryKey(activeLojaId!) }),
      ]);
      toast({
        title: `Fechamento de ${rotuloCompetencia(competencia)} gerado`,
        description: `${criados.length} vendedora(s) — as contas a pagar foram lançadas.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao gerar o fechamento",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  }

  const nomePorUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const membro of equipe.data ?? []) mapa.set(membro.usuarioId, membro.nome);
    return mapa;
  }, [equipe.data]);

  const jaFechada = (fechamentos.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-serif">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          A faixa que a vendedora alcançar no fim do mês vale para tudo que ela vendeu — bater o
          próximo degrau compensa até o último dia.
        </p>
      </div>

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
                <SelectItem key={c} value={c} className="capitalize">
                  {rotuloCompetencia(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onGerarFechamento} disabled={gerarFechamento.isPending || jaFechada}>
          {gerarFechamento.isPending ? "Fechando…" : "Fechar competência"}
        </Button>
        {jaFechada && <Badge variant="secondary">Já fechada</Badge>}
      </div>

      {/* — Ranking ao vivo — */}
      <Card>
        <CardHeader>
          <CardTitle>Como está o mês</CardTitle>
          <CardDescription className="capitalize">
            {rotuloCompetencia(competencia)} — o que seria pago se fechasse agora.
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
                        Vendeu R$ {brl(linha.totalVendas)}
                        {linha.percentualAplicado !== null && linha.percentualAplicado !== undefined
                          ? ` · ${linha.percentualAplicado}%`
                          : " · sem faixa atingida"}
                        {!!linha.valorBonus && ` · bônus R$ ${brl(linha.valorBonus)}`}
                      </p>
                    )}
                    {!!linha.estornoPendente && (
                      <p className="text-xs text-destructive">
                        {soEstorno
                          ? `R$ ${brl(linha.estornoPendente)} de estorno esperando — segue pendente até ela voltar a vender`
                          : `R$ ${brl(linha.estornoPendente)} de estorno abatido (cancelamento de mês já pago)`}
                      </p>
                    )}
                    {linha.faltaProximoDegrau !== null && linha.faltaProximoDegrau !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Faltam R$ {brl(linha.faltaProximoDegrau)} para o próximo degrau
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-serif text-xl tabular-nums">
                    R$ {brl(linha.valorTotal)}
                  </span>
                </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
              {fechamentos.data?.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {f.vendedoraNome ?? nomePorUsuario.get(f.vendedoraId) ?? "Vendedora"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Base R$ {brl(f.totalVendas)}
                      {f.percentualAplicado !== null && f.percentualAplicado !== undefined && ` · ${f.percentualAplicado}%`}
                      {" · comissão "}R$ {brl(f.valorComissao)}
                      {!!f.valorBonus && ` · bônus R$ ${brl(f.valorBonus)}`}
                      {f.fechadoEm && ` · fechado em ${diaFmt.format(new Date(f.fechadoEm))}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-serif text-xl tabular-nums">R$ {brl(f.valorTotal)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* — Escada por vendedora — */}
      <Card>
        <CardHeader>
          <CardTitle>Regras de Comissão</CardTitle>
          <CardDescription>
            Cada vendedora tem a sua escada. Um intervalo sem faixa não comissiona — é assim que se
            diz “abaixo disso não paga”.
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
            <ul className="space-y-4">
              {regras.data?.map((regra: ComissaoRegra) => (
                <li key={regra.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {regra.vendedoraNome ?? nomePorUsuario.get(regra.vendedoraId) ?? "Vendedora"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vale desde {diaFmt.format(new Date(regra.vigenciaInicio))}
                        {regra.bonusAcumulaFaixas && " · bônus acumulam"}
                        {!regra.ativo && " · inativa"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover regra de ${regra.vendedoraNome ?? "vendedora"}`}
                      disabled={removerRegra.isPending}
                      onClick={() => onRemoverRegra(regra.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {regra.faixas.map((f) => (
                      <li key={f.id} className="text-sm tabular-nums text-muted-foreground">
                        {descreverFaixa(f)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {/* — Nova regra — */}
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
                <div key={i} className="flex flex-wrap items-end gap-2">
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
                onClick={() => setFaixas((prev) => [...prev, { ...FAIXA_VAZIA }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar faixa
              </Button>
              <Button size="sm" onClick={onSalvarRegra} disabled={criarRegra.isPending}>
                {criarRegra.isPending ? "Salvando…" : "Salvar regra"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
