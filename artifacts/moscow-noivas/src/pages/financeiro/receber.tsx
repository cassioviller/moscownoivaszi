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
import { podeNoModulo } from "@/lib/permissoes";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useEstornarParcela,
  getExportarParcelasUrl,
  type Parcela,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { brl, diaMesAno } from "@/lib/formatos";
import {
  rotuloForma,
  estaAtrasada,
  vencidas,
  estaAberta,
  saldoAberto,
  teveRecebimento,
} from "@/lib/financeiro/forma";
import { hojeLocal, resolverIntervalo, negocioNoIntervalo } from "@/lib/financeiro/datas";
import { reais, somaCentavos } from "@/lib/financeiro/dinheiro";
import { ResumoCard, invalidarCaixa } from "./helpers";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import { mensagemApi } from "@/lib/erro-api";
import { DialogoReceberParcela, rotuloParcela } from "@/components/dialogo-receber-parcela";

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
  const { activeLojaId, acessosModulos } = useAuth();
  // Receber e estornar parcela são guardados pelo módulo **leads** no servidor
  // (contratos.ts:76 — B9/E101, "a noiva paga na mão de quem a atendeu"), e
  // esta tela não tinha gate nenhum: os dois botões apareciam para toda gente
  // do financeiro e o 403 só chegava depois do clique, no diálogo.
  const podeMovimentar = podeNoModulo(acessosModulos, "leads", "editar");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const filtro = (FILTROS.find((f) => f.chave === searchParams.get("filtro"))?.chave ??
    "abertas") as FiltroReceber;
  const intervalo = resolverIntervalo(searchParams.get("ini"), searchParams.get("fim"));

  // Recebimento — o diálogo virou componente no F28 (a cobrança precisa dele
  // também); daqui só sai QUAL parcela, e o preenchimento é dele.
  const [parcelaReceber, setParcelaReceber] = useState<Parcela | null>(null);

  // Estorno
  const [parcelaEstornar, setParcelaEstornar] = useState<Parcela | null>(null);

  /**
   * A tela é "o que vence nesta janela" — o recorte acontece no servidor
   * (de/ate por vencimento, dia local). O filtro client-side abaixo permanece
   * como cinto de segurança da mesma regra.
   *
   * **F29/E98 — menos "Atrasadas".** Este filtro rodava sobre a janela do mês
   * corrente, então quem clicava lia os atrasos de julho achando que lia a
   * inadimplência inteira: uma parcela vencida em março simplesmente não
   * existia na tela. É a pergunta de dinheiro mais perigosa do sistema para se
   * responder pela metade — e a régua certa já existia no produto, em
   * `/cobranca`, que pede `status: "abertas"` SEM janela.
   *
   * Atrasado não tem janela por definição: se venceu e não foi pago, é atraso,
   * seja de ontem ou de dois anos.
   */
  const semJanela = filtro === "atrasadas";
  const janelaVencimento = semJanela
    ? { status: "abertas" as const }
    : { de: intervalo.iniYMD, ate: intervalo.fimYMD };
  const parcelas = useListParcelas(activeLojaId!, janelaVencimento, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!, janelaVencimento),
      enabled: !!activeLojaId,
    },
  });

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
    () =>
      semJanela
        ? (parcelas.data ?? [])
        : (parcelas.data ?? []).filter((p) => negocioNoIntervalo(p.vencimento, intervalo)),
    [parcelas.data, intervalo.iniYMD, intervalo.fimYMD, semJanela],
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

      {/* Sem esta linha os campos de data pareceriam quebrados: eles continuam
          na tela e deixam de valer. Dizer isso é mais barato do que escondê-los
          — a pessoa precisa saber por que o número mudou. */}
      {semJanela && (
        <p className="text-muted-foreground text-sm">
          Atraso não tem janela: isto mostra <strong>tudo que venceu e não foi pago</strong>, de
          qualquer mês. O período acima não se aplica a este filtro.
        </p>
      )}

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
                    {/* E3/E98 — a tela mais trabalhosa do sistema mostrava
                        quatro linhas visualmente IDÊNTICAS ("Entrada · vence
                        16/07 · R$ 1.000,00"), e o nome da noiva só existia no
                        CSV. Quem recebe precisava abrir o contrato de cada uma
                        para saber de quem era. O dado sempre veio junto — o
                        `contrato.lead` do GET (o spec até documenta que ele
                        existe "para a cobrança juntar por aqui"); esta tela só
                        não o lia. O nome vira a linha 1 e o link. */}
                    <div className="flex min-w-0 flex-col">
                      {p.contrato?.leadId ? (
                        <Link
                          to={naLoja(`/noivas/${p.contrato.leadId}`)}
                          className="truncate font-medium underline-offset-2 hover:underline"
                        >
                          {p.contrato.lead?.noivaNome ?? "Noiva"}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{rotuloParcela(p)}</span>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {p.contrato?.leadId ? <>{rotuloParcela(p)} · </> : null}
                        Vence {diaMesAno(p.vencimento)} ·{" "}
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
                  {podeMovimentar && (estaAberta(p) || teveRecebimento(p)) && (
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
                        <Button size="sm" variant="outline" onClick={() => setParcelaReceber(p)}>
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

      <DialogoReceberParcela
        lojaId={activeLojaId!}
        parcela={parcelaReceber}
        onFechar={() => setParcelaReceber(null)}
      />

      <AlertDialog open={!!parcelaEstornar} onOpenChange={(aberto) => !aberto && setParcelaEstornar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar este recebimento?</AlertDialogTitle>
            {/* E10/E99 — a confirmação NOMEIA o objeto e o valor.

                Ela dizia "a parcela volta para em aberto e o valor sai do caixa
                realizado": nem de quem, nem de quanto. Numa tela que lista
                dezenas de parcelas, quem clica na linha errada não tem como
                perceber antes de confirmar.

                E o valor é o RECEBIDO, não o previsto — a distinção não é
                cosmética. Numa PARCIAL de R$ 1.000,00 com R$ 300,00 recebidos, o
                estorno tira **R$ 300,00** do caixa; escrever R$ 1.000,00 aqui
                seria a tela mentindo sobre dinheiro num clique sem volta. */}
            <AlertDialogDescription>
              {parcelaEstornar && (
                <>
                  Os{" "}
                  <span className="font-medium">
                    {brl(parcelaEstornar.valorRecebido ?? 0)}
                  </span>{" "}
                  recebidos de{" "}
                  <span className="font-medium">
                    {parcelaEstornar.contrato?.lead?.noivaNome ?? "esta noiva"}
                  </span>{" "}
                  ({rotuloParcela(parcelaEstornar)}) saem do caixa realizado e a
                  parcela volta para em aberto.
                </>
              )}
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
