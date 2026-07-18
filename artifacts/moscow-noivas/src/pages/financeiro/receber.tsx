/**
 * Contas a receber — a carteira de entrada da loja: o que vem das noivas.
 *
 * A API devolve TODAS as parcelas da loja (`listParcelas` não tem params), então
 * filtro e intervalo são resolvidos no cliente. O intervalo mira o VENCIMENTO
 * (data de negócio) em todos os filtros, inclusive "recebidas": a pergunta da
 * tela é "o que vence nesta janela", não "o que entrou no caixa" — essa é a do
 * fluxo de caixa. Atraso é sempre derivado (`estaAtrasada`), nunca lido do status.
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useReceberParcela,
  useEstornarParcela,
  getExportarParcelasUrl,
  type Parcela,
  type ReceberParcelaInputFormaRecebimento,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ROTULO_FORMA, FORMAS, rotuloForma, estaAtrasada, vencidas } from "@/lib/financeiro/forma";
import { hojeLocal, resolverIntervalo, negocioNoIntervalo } from "@/lib/financeiro/datas";
import { parseValor, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { ResumoCard, dataFmt, mensagemApi, useCaminhoDaLoja } from "./helpers";

const MENSAGENS_ERRO: Record<string, string> = {
  PARCELA_NAO_PAGA: "Este recebimento não está pago — nada a estornar.",
  PARCELA_JA_RECEBIDA: "Esta parcela já foi recebida.",
  PARCELA_CANCELADA: "Parcela cancelada não pode ser recebida.",
  CONTRATO_NAO_ATIVO: "Contrato cancelado — sem movimentação de parcelas.",
};


const FILTROS = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "atrasadas", rotulo: "Atrasadas" },
  { chave: "recebidas", rotulo: "Recebidas" },
  { chave: "todas", rotulo: "Todas" },
] as const;

type FiltroReceber = (typeof FILTROS)[number]["chave"];



export default function Receber() {
  const naLoja = useCaminhoDaLoja();
  const { activeLojaId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const filtro = (FILTROS.find((f) => f.chave === searchParams.get("filtro"))?.chave ??
    "abertas") as FiltroReceber;
  const intervalo = resolverIntervalo(searchParams.get("ini"), searchParams.get("fim"));

  // Recebimento
  const [parcelaReceber, setParcelaReceber] = useState<Parcela | null>(null);
  const [valorRecebido, setValorRecebido] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(hojeLocal());
  const [formaRecebimento, setFormaRecebimento] = useState<ReceberParcelaInputFormaRecebimento | "">("");

  // Estorno
  const [parcelaEstornar, setParcelaEstornar] = useState<Parcela | null>(null);

  // A tela é "o que vence nesta janela" — o recorte agora acontece no servidor
  // (de/ate por vencimento, dia local). O filtro client-side abaixo permanece
  // como cinto de segurança da mesma regra.
  const janelaVencimento = { de: intervalo.iniYMD, ate: intervalo.fimYMD };
  const parcelas = useListParcelas(activeLojaId!, janelaVencimento, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!, janelaVencimento),
      enabled: !!activeLojaId,
    },
  });

  const receber = useReceberParcela();
  const estornar = useEstornarParcela();

  const hoje = hojeLocal();

  const atualizarParams = (patch: Record<string, string>) => {
    const proximo = new URLSearchParams(searchParams);
    for (const [chave, valor] of Object.entries(patch)) {
      if (valor) proximo.set(chave, valor);
      else proximo.delete(chave);
    }
    setSearchParams(proximo, { replace: true });
  };

  const naJanela = useMemo(
    () => (parcelas.data ?? []).filter((p) => negocioNoIntervalo(p.vencimento, intervalo)),
    [parcelas.data, intervalo.iniYMD, intervalo.fimYMD],
  );

  const resumo = useMemo(() => {
    const previstas = naJanela.filter((p) => p.status === "PREVISTA");
    const pagas = naJanela.filter((p) => p.status === "PAGA");
    return {
      aReceber: reais(somaCentavos(previstas, (p) => p.valorPrevisto)),
      recebido: reais(somaCentavos(pagas, (p) => p.valorRecebido ?? p.valorPrevisto)),
      emAtraso: vencidas(naJanela, hoje).total,
    };
  }, [naJanela, hoje]);

  const lista = useMemo(() => {
    const filtrada = naJanela.filter((p) => {
      if (filtro === "abertas") return p.status === "PREVISTA";
      if (filtro === "atrasadas") return estaAtrasada(p, hoje);
      if (filtro === "recebidas") return p.status === "PAGA";
      return true;
    });
    return filtrada.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [naJanela, filtro, hoje]);

  const invalidarParcelas = () =>
    queryClient.invalidateQueries({ queryKey: getListParcelasQueryKey(activeLojaId!) });

  const rotuloParcela = (p: Parcela) =>
    p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`;

  const abrirReceber = (parcela: Parcela) => {
    setValorRecebido(parcela.valorPrevisto.toFixed(2).replace(".", ","));
    setDataRecebimento(hojeLocal());
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
    if (!dataRecebimento) {
      toast({ title: "Informe a data do recebimento", variant: "destructive" });
      return;
    }
    // `recebidoEm` é um INSTANTE: para hoje vale o agora real; para um dia
    // passado, meio-dia de São Paulo mantém o dia local correto.
    const recebidoEm =
      dataRecebimento === hojeLocal() ? new Date().toISOString() : diaParaISO(dataRecebimento);
    try {
      await receber.mutateAsync({
        lojaId: activeLojaId!,
        parcelaId: parcelaReceber.id,
        data: {
          valorRecebido: valor,
          recebidoEm,
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

  const onEstornar = async () => {
    if (!parcelaEstornar) return;
    try {
      await estornar.mutateAsync({ lojaId: activeLojaId!, parcelaId: parcelaEstornar.id });
      await invalidarParcelas();
      toast({ title: "Recebimento estornado" });
      setParcelaEstornar(null);
    } catch (err) {
      toast({
        title: "Erro ao estornar",
        description: mensagemApi(err, "Tente novamente.", MENSAGENS_ERRO),
        variant: "destructive",
      });
    }
  };

  const statusParcela = (p: Parcela) => {
    if (p.status === "CANCELADA") return { rotulo: "Cancelada", variante: "outline" as const };
    if (p.status === "PAGA") {
      const forma = p.formaRecebimento ? ` (${rotuloForma(p.formaRecebimento)})` : "";
      return { rotulo: `Recebida${forma}`, variante: "default" as const };
    }
    if (estaAtrasada(p, hoje)) return { rotulo: "Atrasada", variante: "destructive" as const };
    return { rotulo: "Prevista", variante: "secondary" as const };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif">Contas a receber</h1>
          <p className="text-sm text-muted-foreground">O que entra das noivas, por contrato.</p>
        </div>
        {/* Download nativo do CSV da janela em vista — com a noiva na linha. */}
        <Button variant="outline" asChild>
          <a
            href={getExportarParcelasUrl(activeLojaId!, {
              de: intervalo.iniYMD,
              ate: intervalo.fimYMD,
            })}
            download
          >
            Exportar CSV
          </a>
        </Button>
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
        <ResumoCard rotulo="A receber" valor={resumo.aReceber} />
        <ResumoCard rotulo="Recebido" valor={resumo.recebido} />
        <ResumoCard rotulo="Em atraso" valor={resumo.emAtraso} destaque />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.chave}
            size="sm"
            variant={f.chave === filtro ? "default" : "outline"}
            onClick={() => atualizarParams({ filtro: f.chave })}
          >
            {f.rotulo}
          </Button>
        ))}
      </div>

      {parcelas.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar as parcelas.</span>
            <Button variant="outline" size="sm" onClick={() => parcelas.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : parcelas.isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada por aqui neste filtro.</p>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {lista.map((p) => {
              const status = statusParcela(p);
              const atrasada = estaAtrasada(p, hoje);
              return (
                <div key={p.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{rotuloParcela(p)}</span>
                      <span className="text-xs text-muted-foreground">
                        Vence {dataFmt.format(new Date(p.vencimento))} ·{" "}
                        <Link to={naLoja(`/contratos/${p.contratoId}`)} className="underline underline-offset-2 hover:text-primary">
                          contrato
                        </Link>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={status.variante}>{status.rotulo}</Badge>
                      <span className={`font-serif tabular-nums ${atrasada ? "text-destructive" : ""}`}>
                        R$ {brl(p.valorPrevisto)}
                      </span>
                    </div>
                  </div>

                  {p.status === "PREVISTA" && (
                    <div className="flex justify-end border-t pt-2">
                      <Button size="sm" variant="outline" onClick={() => abrirReceber(p)}>
                        Receber
                      </Button>
                    </div>
                  )}
                  {p.status === "PAGA" && (
                    <div className="flex justify-end border-t pt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={estornar.isPending}
                        onClick={() => setParcelaEstornar(p)}
                      >
                        Estornar recebimento
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!parcelaReceber} onOpenChange={(aberto) => !aberto && setParcelaReceber(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Registrar recebimento{parcelaReceber ? ` — ${rotuloParcela(parcelaReceber)}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="valorRecebido">Valor recebido</Label>
              <Input
                id="valorRecebido"
                value={valorRecebido}
                onChange={(e) => setValorRecebido(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dataRecebimento">Data</Label>
              <Input
                id="dataRecebimento"
                type="date"
                value={dataRecebimento}
                onChange={(e) => setDataRecebimento(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="formaRecebimento">Forma</Label>
              <Select
                value={formaRecebimento || undefined}
                onValueChange={(v) => setFormaRecebimento(v as ReceberParcelaInputFormaRecebimento)}
              >
                <SelectTrigger id="formaRecebimento">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParcelaReceber(null)}>
              Cancelar
            </Button>
            <Button onClick={onReceber} disabled={receber.isPending}>
              {receber.isPending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!parcelaEstornar} onOpenChange={(aberto) => !aberto && setParcelaEstornar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar este recebimento?</AlertDialogTitle>
            <AlertDialogDescription>
              A parcela volta para em aberto e o valor sai do caixa realizado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onEstornar} disabled={estornar.isPending}>
              {estornar.isPending ? "Estornando…" : "Estornar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
