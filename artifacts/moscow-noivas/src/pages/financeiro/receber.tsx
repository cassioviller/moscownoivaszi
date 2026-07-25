/**
 * Contas a receber — a carteira de entrada da loja: o que vem das noivas.
 *
 * O intervalo é recortado no SERVIDOR (`listParcelas` recebe `de`/`ate` por
 * vencimento desde o E79) e refiltrado aqui como cinto de segurança; o filtro
 * por status é do cliente. O intervalo mira o VENCIMENTO
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
import {
  ROTULO_FORMA,
  FORMAS,
  rotuloForma,
  estaAtrasada,
  vencidas,
  estaAberta,
  saldoAberto,
  teveRecebimento,
} from "@/lib/financeiro/forma";
import { hojeLocal, resolverIntervalo, negocioNoIntervalo } from "@/lib/financeiro/datas";
import { parseValor, reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { ResumoCard, dataFmt, useCaminhoDaLoja, invalidarCaixa } from "./helpers";
import { mensagemApi } from "@/lib/erro-api";

const MENSAGENS_ERRO: Record<string, string> = {
  PARCELA_NAO_PAGA: "Este recebimento não está pago — nada a estornar.",
  PARCELA_JA_RECEBIDA: "Esta parcela já foi recebida.",
  PARCELA_CANCELADA: "Parcela cancelada não pode ser recebida.",
  CONTRATO_NAO_ATIVO: "Contrato cancelado — sem movimentação de parcelas.",
  // B6/E94: a rota passou a recusar o recebimento quando a parcela mudou entre
  // a leitura e a gravação — é o que impede dois lançamentos simultâneos de
  // perderem um. Sem esta linha, trocaríamos perda de dinheiro por um "HTTP
  // 409" na cara da vendedora. A ação que resolve é reabrir e conferir, e a
  // lista atrás do diálogo já foi invalidada pelo movimento que venceu.
  PARCELA_MUDOU: "Alguém acabou de receber nesta parcela — confira o valor e lance de novo.",
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

  // Abertas contam o SALDO (E49): a parcela meio recebida entra aqui com o
  // que falta, e no "recebido" com o que entrou — as duas coisas ao mesmo
  // tempo, que é a verdade de um pagamento parcial.
  const resumo = useMemo(() => {
    const abertas = naJanela.filter(estaAberta);
    const comRecebimento = naJanela.filter(teveRecebimento);
    return {
      aReceber: reais(somaCentavos(abertas, saldoAberto)),
      recebido: reais(somaCentavos(comRecebimento, (p) => p.valorRecebido ?? 0)),
      emAtraso: vencidas(naJanela, hoje).total,
    };
  }, [naJanela, hoje]);

  const lista = useMemo(() => {
    const filtrada = naJanela.filter((p) => {
      if (filtro === "abertas") return estaAberta(p);
      if (filtro === "atrasadas") return estaAtrasada(p, hoje);
      if (filtro === "recebidas") return teveRecebimento(p);
      return true;
    });
    return filtrada.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [naJanela, filtro, hoje]);

  // D9: um recebimento não muda só as parcelas — muda o fluxo, o DRE, o alerta
  // de caixa (montado no dashboard e no sino) e o realizado. A lista mora em
  // `lib/financeiro/cache.ts`.
  const invalidarMovimento = () => invalidarCaixa(queryClient, activeLojaId!);

  const rotuloParcela = (p: Parcela) =>
    p.numero === 0 ? "Entrada" : p.descricao || `Parcela ${p.numero}`;

  const abrirReceber = (parcela: Parcela) => {
    // Sugere o que FALTA, não o previsto: numa parcela meio recebida, repetir
    // o valor cheio faria a vendedora cobrar de novo o que já entrou.
    setValorRecebido(saldoAberto(parcela).toFixed(2).replace(".", ","));
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
      await invalidarMovimento();
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
      await invalidarMovimento();
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
    // Parcial atrasada é atrasada: o resto venceu igual.
    if (p.status === "PARCIAL") {
      return estaAtrasada(p, hoje)
        ? { rotulo: "Parcial · atrasada", variante: "destructive" as const }
        : { rotulo: "Parcial", variante: "secondary" as const };
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
                      <div className="flex flex-col items-end">
                        <span className={`font-serif tabular-nums ${atrasada ? "text-destructive" : ""}`}>
                          {brl(p.valorPrevisto)}
                        </span>
                        {/* Mostra a conta, não só o resultado: numa parcela
                            meio recebida o valor da parcela sozinho não diz o
                            que ainda falta — e é o que falta que se cobra. */}
                        {p.status === "PARCIAL" && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {brl(p.valorRecebido ?? 0)} recebido · faltam{" "}
                            {brl(saldoAberto(p))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Uma parcela PARCIAL tem as DUAS saídas ao mesmo tempo:
                      receber o que falta ou desfazer o que entrou. */}
                  {(estaAberta(p) || teveRecebimento(p)) && (
                    <div className="flex justify-end gap-2 border-t pt-2">
                      {teveRecebimento(p) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={estornar.isPending}
                          onClick={() => setParcelaEstornar(p)}
                        >
                          Estornar recebimento
                        </Button>
                      )}
                      {estaAberta(p) && (
                        <Button size="sm" variant="outline" onClick={() => abrirReceber(p)}>
                          {p.status === "PARCIAL" ? "Receber o restante" : "Receber"}
                        </Button>
                      )}
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
              {/* E92/E20: o campo de dinheiro MAIS usado do sistema subia o
                  teclado QWERTY no celular. Nunca type="number" para dinheiro:
                  vira roleta e muda o valor quando o dedo rola a página. */}
              <Input
                id="valorRecebido"
                inputMode="decimal"
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
