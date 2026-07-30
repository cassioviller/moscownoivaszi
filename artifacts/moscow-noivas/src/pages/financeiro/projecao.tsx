import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListContasPagar,
  getListContasPagarQueryKey,
  useListSaldoReferencia,
  getListSaldoReferenciaQueryKey,
  useListPagamentos,
  getListPagamentosQueryKey,
  useCreateSaldoReferencia,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ErroListagem, invalidarCaixa } from "./helpers";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import { mensagemApi } from "@/lib/erro-api";
import { podeNoModulo } from "@/lib/permissoes";
import { brl, diaParaISO } from "@/lib/formatos";
import { diaLocal, hojeLocal } from "@/lib/financeiro/datas";
import {
  projetarCaixa,
  normalizarHorizonte,
  HORIZONTES,
  type LinhaCurva,
} from "@/lib/financeiro/projecao";
import { ancoraAtiva, saldoDeHoje, validarConferencia } from "@/lib/financeiro/saldo";

const diaFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" });

/** Formata um dia YYYY-MM-DD sem deixar o fuso empurrar a data. */
function formatarDia(dia: string, fmt: Intl.DateTimeFormat): string {
  return fmt.format(new Date(`${dia}T12:00:00Z`));
}



export default function Projecao() {
  const naLoja = useCaminhoDaLoja();
  const { activeLojaId, acessosModulos } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const horizonteDias = normalizarHorizonte(searchParams.get("h"));
  const podeConferir = podeNoModulo(acessosModulos, "financeiro", "criar");

  const [conferirOpen, setConferirOpen] = useState(false);
  const [diaConferido, setDiaConferido] = useState(hojeLocal());
  const [valorConferido, setValorConferido] = useState("");
  const criarSaldo = useCreateSaldoReferencia();

  // E79: dois recortes no lugar da história inteira. A curva precisa das
  // ABERTAS (futuro + atraso, qualquer vencimento) — as pagas de anos atrás
  // nunca entraram nela.
  const paramsAbertas = { status: "abertas" as const };
  const parcelas = useListParcelas(activeLojaId!, paramsAbertas, {
    query: { queryKey: getListParcelasQueryKey(activeLojaId!, paramsAbertas), enabled: !!activeLojaId },
  });
  // E93/D2: o mesmo recorte do lado das saídas — `projetarCaixa` só olha as
  // PREVISTA (as pagas já saíram do caixa e nunca entraram na curva), então
  // baixar a carteira inteira era baixar o histórico da loja para desenhar o
  // futuro dela.
  const contasPagar = useListContasPagar(activeLojaId!, paramsAbertas, {
    query: {
      queryKey: getListContasPagarQueryKey(activeLojaId!, paramsAbertas),
      enabled: !!activeLojaId,
    },
  });
  const saldos = useListSaldoReferencia(activeLojaId!, {
    query: { queryKey: getListSaldoReferenciaQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const hoje = hojeLocal();
  const ancora = useMemo(() => ancoraAtiva(saldos.data, hoje), [saldos.data, hoje]);
  const ancoraDia = ancora ? diaLocal(ancora.dataReferencia) : null;

  // Queries dependentes: só o realizado ENTRE a âncora e hoje interessa, e a
  // janela só existe depois que a âncora chega. As RECEBIDAS desde a âncora
  // são o segundo recorte do E79 — separadas das abertas de propósito: uma
  // PARCIAL recebida ontem está nas duas listas, e somá-la junto contaria o
  // mesmo dinheiro em dobro no resumo.
  const janela = ancoraDia ? { de: ancoraDia, ate: hoje } : undefined;
  const pagamentos = useListPagamentos(activeLojaId!, janela, {
    query: {
      queryKey: getListPagamentosQueryKey(activeLojaId!, janela),
      enabled: !!activeLojaId && !!ancoraDia,
    },
  });
  const paramsRecebidas = ancoraDia ? { recebidasDe: ancoraDia } : undefined;
  const recebidas = useListParcelas(activeLojaId!, paramsRecebidas, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!, paramsRecebidas),
      enabled: !!activeLojaId && !!ancoraDia,
    },
  });

  /**
   * A curva parte do saldo de HOJE, não da âncora crua: entre "em 14/07 tinha
   * 8 mil" e agora o caixa andou, e ignorar isso nasce a curva inteira no nível
   * errado. Sem âncora não há nível — a curva mostra só a forma, partindo de 0.
   */
  const saldo = useMemo(
    () => saldoDeHoje(saldos.data, recebidas.data ?? [], pagamentos.data ?? [], hoje),
    [saldos.data, recebidas.data, pagamentos.data, hoje],
  );
  const semAncora = saldo === null;

  const projecao = useMemo(
    () =>
      projetarCaixa(parcelas.data ?? [], contasPagar.data ?? [], {
        saldoInicial: saldo?.valor ?? 0,
        horizonteDias,
        hoje,
      }),
    [parcelas.data, contasPagar.data, saldo, horizonteDias, hoje],
  );

  async function onConferir() {
    const conferencia = validarConferencia(diaConferido, valorConferido, hoje);
    if (!conferencia.ok) {
      toast({ title: conferencia.erro, variant: "destructive" });
      return;
    }
    try {
      await criarSaldo.mutateAsync({
        lojaId: activeLojaId!,
        data: { dataReferencia: diaParaISO(diaConferido), valor: conferencia.valor },
      });
      // A âncora de saldo é o ponto de partida da curva: conferir o caixa muda
      // a projeção e o alerta que o sino mostra em toda tela, não só a lista de
      // âncoras. Mesma régua do D9/E93.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getListSaldoReferenciaQueryKey(activeLojaId!),
        }),
        invalidarCaixa(queryClient, activeLojaId!),
      ]);
      toast({
        title: "Saldo conferido",
        description: `${brl(conferencia.valor)} no início de ${formatarDia(diaConferido, diaLongo)}.`,
      });
      setConferirOpen(false);
      setValorConferido("");
    } catch (err) {
      toast({
        title: "Não deu para registrar o saldo",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  function trocarHorizonte(h: number) {
    const proximo = new URLSearchParams(searchParams);
    proximo.set("h", String(h));
    setSearchParams(proximo, { replace: true });
  }

  // `pagamentos` entra aqui: sem ele o saldo de hoje volta a ser a âncora crua,
  // e a curva inteira nasceria no nível errado — em silêncio. Enquanto não há
  // âncora a query fica desabilitada, e desabilitada não é carregando.
  const isLoading =
    parcelas.isLoading ||
    contasPagar.isLoading ||
    saldos.isLoading ||
    pagamentos.isLoading ||
    recebidas.isLoading;
  const isError =
    parcelas.isError || contasPagar.isError || saldos.isError || pagamentos.isError || recebidas.isError;

  function recarregar() {
    if (parcelas.isError) parcelas.refetch();
    if (contasPagar.isError) contasPagar.refetch();
    if (saldos.isError) saldos.refetch();
    if (pagamentos.isError) pagamentos.refetch();
    if (recebidas.isError) recebidas.refetch();
  }

  const { curva, emAtraso } = projecao;
  const temAtraso = emAtraso.aReceber !== 0 || emAtraso.aPagar !== 0;

  const seletor = (
    <div className="flex gap-1" role="group" aria-label="Horizonte da projeção">
      {HORIZONTES.map((h) => (
        <Button
          key={h}
          size="sm"
          variant={horizonteDias === h ? "default" : "ghost"}
          aria-pressed={horizonteDias === h}
          onClick={() => trocarHorizonte(h)}
        >
          {h}d
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <Link to={naLoja("/financeiro")} className="text-sm text-muted-foreground hover:text-foreground">
          ← Fluxo de caixa
        </Link>
        <h1 className="text-3xl font-serif">Projeção de caixa</h1>
        <p className="text-sm text-muted-foreground">
          Projeção do que está previsto — não é caixa realizado.
        </p>
      </header>

      {isError && (
        <ErroListagem
          mensagem="Falha ao buscar os dados da projeção."
          onRetry={recarregar}
        />
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>Saldo de partida</CardTitle>
              {podeConferir && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDiaConferido(hoje);
                    setConferirOpen(true);
                  }}
                >
                  Conferir saldo
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {semAncora ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum saldo de referência registrado. A curva parte de{" "}
                  <span className="tabular-nums">R$ 0,00</span> — ela mostra a forma do período, não
                  o nível do caixa.
                  {podeConferir && (
                    <> Confira o caixa e registre o saldo para ancorar a curva no nível real.</>
                  )}
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-3xl font-serif tabular-nums">{brl(saldo.valor)}</p>
                  {/* Mostra a conta, não só o resultado: o número de hoje é uma
                      inferência a partir do último dia conferido, e quem lê
                      precisa saber de quando vem a certeza. */}
                  <p className="text-xs text-muted-foreground">
                    saldo de hoje — conferido em{" "}
                    {formatarDia(saldo.ancoraDia, diaFmt)}
                    {saldo.movimentoDesdeAncora !== 0 && (
                      <>
                        {" "}
                        e {saldo.movimentoDesdeAncora > 0 ? "somado de" : "descontado de"}{" "}
                        <span className="tabular-nums">
                          {brl(Math.abs(saldo.movimentoDesdeAncora))}
                        </span>{" "}
                        que o caixa andou desde então
                      </>
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {temAtraso && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-destructive text-sm uppercase tracking-widest">
                  Em atraso · fora da curva
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Vencidos em aberto não entram na projeção: já deviam ter acontecido e cairiam na
                  data errada, inflando a curva com dinheiro que não veio.
                </p>
                <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                  {emAtraso.aReceber !== 0 && (
                    <span>
                      <span className="font-semibold text-positivo tabular-nums">
                        {brl(emAtraso.aReceber)}
                      </span>{" "}
                      a receber
                    </span>
                  )}
                  {emAtraso.aPagar !== 0 && (
                    <span>
                      <span className="font-semibold text-destructive tabular-nums">
                        {brl(emAtraso.aPagar)}
                      </span>{" "}
                      a pagar
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>Curva projetada · {horizonteDias} dias</CardTitle>
              {seletor}
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                {curva.diaNegativo ? (
                  <>
                    Caixa fica{" "}
                    <span className="font-semibold text-destructive">
                      negativo em {formatarDia(curva.diaNegativo, diaLongo)}
                    </span>
                    .
                  </>
                ) : (
                  <>Caixa positivo em todo o horizonte.</>
                )}{" "}
                Menor saldo:{" "}
                <span className="font-semibold tabular-nums">{brl(curva.menorSaldo.valor)}</span>
                {curva.menorSaldo.dia ? (
                  <> em {formatarDia(curva.menorSaldo.dia, diaFmt)}</>
                ) : (
                  <> (hoje, {formatarDia(hojeLocal(), diaFmt)})</>
                )}
                .
              </p>

              {curva.linhas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada previsto neste horizonte.</p>
              ) : (
                <CurvaLista
                  linhas={curva.linhas}
                  diaNegativo={curva.diaNegativo}
                  diaMenor={curva.menorSaldo.dia}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={conferirOpen} onOpenChange={setConferirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferir saldo do caixa</DialogTitle>
            <DialogDescription>
              O valor é o saldo real no início do dia conferido. Conferir o mesmo dia de novo
              corrige o número registrado — não empilha outro saldo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="dia-conferido">Dia conferido</Label>
              <Input
                id="dia-conferido"
                type="date"
                max={hoje}
                value={diaConferido}
                onChange={(e) => setDiaConferido(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="valor-conferido">Saldo no início do dia</Label>
              <Input
                id="valor-conferido"
                inputMode="decimal"
                value={valorConferido}
                onChange={(e) => setValorConferido(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConferirOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onConferir} disabled={criarSaldo.isPending}>
              {criarSaldo.isPending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Barras em CSS: cada linha vira uma faixa proporcional ao saldo, com o zero
 * fixo no meio quando há saldo negativo — a queda abaixo da linha é o ponto.
 */
function CurvaLista({
  linhas,
  diaNegativo,
  diaMenor,
}: {
  linhas: readonly LinhaCurva[];
  diaNegativo: string | null;
  diaMenor: string | null;
}) {
  const maxAbs = Math.max(...linhas.map((l) => Math.abs(l.saldoApos)), 1);

  return (
    <ul className="divide-y rounded-md border">
      {linhas.map((l) => {
        const negativo = l.saldoApos < 0;
        const ehPrimeiroNegativo = l.dia === diaNegativo;
        const ehMenor = l.dia === diaMenor;
        const largura = (Math.abs(l.saldoApos) / maxAbs) * 100;

        return (
          <li
            key={l.dia}
            className={`px-4 py-2.5 ${ehPrimeiroNegativo || ehMenor ? "bg-muted/50" : ""}`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm">
                  {formatarDia(l.dia, diaFmt)}
                  {ehPrimeiroNegativo && (
                    <span className="ml-2 text-[11px] uppercase tracking-widest text-destructive">
                      1º dia negativo
                    </span>
                  )}
                  {ehMenor && (
                    <span className="ml-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                      menor saldo
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.entradas !== 0 && <span className="text-positivo">+{brl(l.entradas)} </span>}
                  {l.saidas !== 0 && <span className="text-destructive">−{brl(l.saidas)}</span>}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-medium tabular-nums ${negativo ? "text-destructive" : ""}`}
              >
                {brl(l.saldoApos)}
              </span>
            </div>
            <div className="mt-1.5 flex h-1.5" aria-hidden="true">
              <div className="flex w-1/2 justify-end">
                {negativo && (
                  <div className="h-full rounded-l-sm bg-destructive" style={{ width: `${largura}%` }} />
                )}
              </div>
              <div className="flex w-1/2">
                {!negativo && (
                  <div className="h-full rounded-r-sm bg-primary/60" style={{ width: `${largura}%` }} />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
