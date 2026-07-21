import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListPagamentos,
  getListPagamentosQueryKey,
  useListContratos,
  getListContratosQueryKey,
  useListContasPagar,
  getListContasPagarQueryKey,
  type Parcela,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { ErroListagem } from "./helpers";
import { AlertaCaixa } from "@/components/alerta-caixa";
import { brl } from "@/lib/formatos";
import { resumoCaixa, movimentos, tendenciaCaixa, horizonteAberto } from "@/lib/financeiro/fluxo";
import { recebimentosPorForma } from "@/lib/financeiro/forma";
import { RecebimentosPorFormaLista } from "@/components/recebimentos-por-forma";
import { baixarCsv, linhasFluxo } from "@/lib/financeiro/exportar";
import {
  resolverIntervalo,
  competenciaAtual,
  ultimasCompetencias,
  ultimoDiaDoMes,
} from "@/lib/financeiro/datas";

/**
 * Fluxo de caixa — o hub do financeiro: o que DE FATO entrou e saiu do caixa do
 * atelier no período (realizado, pela data do movimento), o ritmo dos últimos
 * meses e a linha do tempo dos movimentos. Leitura pura: nenhuma ação daqui
 * muda dado. Não é extrato bancário — sem saldo inicial e sem conciliação.
 *
 * Toda a agregação vem do núcleo já testado (`resumoCaixa`, `movimentos`,
 * `tendenciaCaixa`). Esta tela só resolve o intervalo, busca e desenha.
 */

const MESES_NA_TENDENCIA = 6;

/**
 * Instantes (recebidoEm, pagamento.data) só têm dia dentro de um fuso: ler em
 * UTC joga todo movimento do fim da noite para o dia seguinte (ver datas.ts).
 */
const instanteFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Sao_Paulo",
});

/** Dias de negócio (YYYY-MM-DD) já são o dia: meio-dia UTC não escorrega. */
const diaFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const mesFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-07" → "julho de 2026". */
function rotuloCompetencia(competencia: string): string {
  return mesFmt.format(new Date(`${competencia}-01T12:00:00.000Z`));
}

function rotuloDia(dia: string): string {
  return diaFmt.format(new Date(`${dia}T12:00:00.000Z`));
}


export default function FluxoCaixa() {
  const { activeLojaId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // A URL é a fonte do intervalo; ausente/inválido cai no mês corrente.
  const intervalo = useMemo(
    () => resolverIntervalo(searchParams.get("ini"), searchParams.get("fim")),
    [searchParams],
  );

  const competenciaHoje = competenciaAtual();

  /** Janela da tendência: os N meses que terminam no mês corrente. */
  const janelaTendencia = useMemo(() => {
    const comps = ultimasCompetencias(competenciaHoje, MESES_NA_TENDENCIA);
    const primeira = `${comps[0]}-01`;
    return { de: primeira, ate: ultimoDiaDoMes(`${comps[comps.length - 1]}-01`) };
  }, [competenciaHoje]);

  // Parcelas vêm inteiras (a rota não filtra); os helpers da lib recortam o
  // intervalo e as competências a partir daí.
  // Sem janela de propósito: horizonte e competências olham além do período visível.
  const parcelas = useListParcelas(activeLojaId!, undefined, {
    query: { queryKey: getListParcelasQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  // Pagamentos são filtrados no servidor. Duas janelas porque o período visível
  // e a janela da tendência são independentes.
  const paramsPeriodo = { de: intervalo.iniYMD, ate: intervalo.fimYMD };
  const pagamentos = useListPagamentos(activeLojaId!, paramsPeriodo, {
    query: {
      queryKey: getListPagamentosQueryKey(activeLojaId!, paramsPeriodo),
      enabled: !!activeLojaId,
    },
  });

  const pagamentosTendencia = useListPagamentos(activeLojaId!, janelaTendencia, {
    query: {
      queryKey: getListPagamentosQueryKey(activeLojaId!, janelaTendencia),
      enabled: !!activeLojaId,
    },
  });

  // A parcela não traz o contrato aninhado; a noiva vem da lista de contratos.
  const contratos = useListContratos(activeLojaId!, {
    query: { queryKey: getListContratosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const nomeDaNoiva = useMemo(() => {
    const porContrato = new Map<string, string>();
    for (const c of contratos.data ?? []) {
      if (c.lead?.noivaNome) porContrato.set(c.id, c.lead.noivaNome);
    }
    return (p: Parcela) => porContrato.get(p.contratoId) ?? null;
  }, [contratos.data]);

  // Horizonte é previsão pelo vencimento: não depende do intervalo visível, e
  // por isso as contas vêm inteiras.
  const contasPagar = useListContasPagar(activeLojaId!, {
    query: { queryKey: getListContasPagarQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  const horizonte = useMemo(
    () => horizonteAberto(parcelas.data ?? [], contasPagar.data ?? []),
    [parcelas.data, contasPagar.data],
  );

  const resumo = useMemo(
    () => resumoCaixa(parcelas.data ?? [], pagamentos.data ?? [], intervalo),
    [parcelas.data, pagamentos.data, intervalo],
  );

  // As MESMAS entradas do resumo, recortadas por meio (E50): `porForma.total`
  // e `resumo.entradas` são o mesmo dinheiro — se divergirem, um dos dois está
  // lendo errado.
  const porForma = useMemo(
    () => recebimentosPorForma(parcelas.data ?? [], intervalo),
    [parcelas.data, intervalo],
  );

  const linhaDoTempo = useMemo(
    () =>
      movimentos(parcelas.data ?? [], pagamentos.data ?? [], intervalo, {
        lojaId: activeLojaId ?? "",
        nomeDaNoiva,
      }),
    [parcelas.data, pagamentos.data, intervalo, activeLojaId, nomeDaNoiva],
  );

  const tendencia = useMemo(
    () =>
      tendenciaCaixa(parcelas.data ?? [], pagamentosTendencia.data ?? [], {
        meses: MESES_NA_TENDENCIA,
        ate: competenciaHoje,
      }),
    [parcelas.data, pagamentosTendencia.data, competenciaHoje],
  );

  function definirDia(chave: "ini" | "fim", valor: string) {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (valor) proximo.set(chave, valor);
        else proximo.delete(chave);
        return proximo;
      },
      { replace: true },
    );
  }

  // O skeleton cobre tudo que vira número na tela — inclusive o horizonte, que
  // sem as contas renderizaria R$ 0,00 durante o carregamento. Já o ERRO é
  // local a cada seção (tendência e "Em aberto" têm o seu): uma falha no
  // horizonte não deve apagar o caixa do período, que carregou bem.
  // `contratos` fica de fora: sem ela o movimento perde o nome da noiva, não o valor.
  const carregando = parcelas.isPending || pagamentos.isPending || contasPagar.isPending;
  const erro = parcelas.isError || pagamentos.isError;
  const saldoNegativo = resumo.saldo < 0;
  const periodoFmt = `${rotuloDia(intervalo.iniYMD)} – ${rotuloDia(intervalo.fimYMD)}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-serif">Fluxo de caixa</h1>
          <Badge variant="secondary">Realizado</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          O que entrou e saiu do caixa do atelier — pelo que foi registrado aqui, não é o extrato do
          banco.
        </p>
        <div className="flex flex-wrap gap-4 pt-1 text-sm">
          <Link to="projecao" className="text-muted-foreground hover:text-foreground">
            Projeção de caixa →
          </Link>
          <Link to="dre" className="text-muted-foreground hover:text-foreground">
            Resultado do mês →
          </Link>
          <Link to="cobranca" className="text-muted-foreground hover:text-foreground">
            Cobrança →
          </Link>
          <Link to="auditoria" className="text-muted-foreground hover:text-foreground">
            Auditoria →
          </Link>
        </div>
      </div>

      {/* Esta tela é o REALIZADO; o furo mora no previsto, uma tela adiante.
          O aviso é o que costura as duas — e some quando não há o que avisar. */}
      <AlertaCaixa />

      {/* — Lente de visualização (?ini=&fim=) — */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fluxo-ini" className="text-xs text-muted-foreground">
            Início
          </Label>
          <Input
            id="fluxo-ini"
            type="date"
            className="w-40"
            value={intervalo.iniYMD}
            onChange={(e) => definirDia("ini", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fluxo-fim" className="text-xs text-muted-foreground">
            Fim
          </Label>
          <Input
            id="fluxo-fim"
            type="date"
            className="w-40"
            value={intervalo.fimYMD}
            onChange={(e) => definirDia("fim", e.target.value)}
          />
        </div>
        {/* E22: o CSV nasce da MESMA linha do tempo da tela (movimentos). */}
        <Button
          variant="outline"
          size="sm"
          disabled={carregando || erro || linhaDoTempo.length === 0}
          onClick={() =>
            baixarCsv(
              `fluxo-${intervalo.iniYMD}-a-${intervalo.fimYMD}.csv`,
              linhasFluxo(linhaDoTempo),
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {erro ? (
        <ErroListagem
          mensagem="Falha ao buscar os movimentos do período."
          onRetry={() => {
            if (parcelas.isError) parcelas.refetch();
            if (pagamentos.isError) pagamentos.refetch();
          }}
        />
      ) : carregando ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* — Caixa no período — */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Entradas</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-positivo">
                  R$ {brl(resumo.entradas)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saídas</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-destructive">
                  R$ {brl(resumo.saidas)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saldo</CardDescription>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-2xl font-semibold tabular-nums ${
                    saldoNegativo ? "text-destructive" : "text-positivo"
                  }`}
                >
                  R$ {brl(resumo.saldo)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* — Por onde o dinheiro entrou (E50): o detalhe das Entradas acima.
              Some quando não houve entrada — card vazio não informa nada. — */}
          {porForma.linhas.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">
                  Entradas por meio
                </CardTitle>
                <CardDescription>Para conciliar cartão, Pix e caixa físico.</CardDescription>
              </CardHeader>
              <CardContent>
                <RecebimentosPorFormaLista dados={porForma} />
              </CardContent>
            </Card>
          )}

          {/* — Em aberto: previsão pelo vencimento, fora do caixa realizado. É
              a porta para as telas de ação (receber/pagar). — */}
          {contasPagar.isError ? (
            // Sem as contas, "A pagar: R$ 0,00" seria mentira — e a usuária leria
            // "não devo nada" com boletos vencidos. Melhor dizer que falhou.
            <ErroListagem
              mensagem="Falha ao buscar o que está em aberto."
              onRetry={() => contasPagar.refetch()}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Link to="receber" className="rounded-lg border p-4 transition-colors hover:border-primary">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">A receber</p>
                  <p className="text-xl font-semibold tabular-nums">R$ {brl(horizonte.aReceber)}</p>
                  {horizonte.aReceberAtraso > 0 && (
                    <p className="text-xs text-destructive">R$ {brl(horizonte.aReceberAtraso)} em atraso</p>
                  )}
                </Link>
                <Link to="pagar" className="rounded-lg border p-4 transition-colors hover:border-primary">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">A pagar</p>
                  <p className="text-xl font-semibold tabular-nums">R$ {brl(horizonte.aPagar)}</p>
                  {horizonte.aPagarAtraso > 0 && (
                    <p className="text-xs text-destructive">R$ {brl(horizonte.aPagarAtraso)} em atraso</p>
                  )}
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Previsão pelo vencimento — ainda não passou pelo caixa.
              </p>
            </>
          )}

          {/* — Tendência: o ritmo do caixa como lista quieta (DESIGN §13, sem
              gráfico) — saldo é o ponto; entradas/saídas ficam na sub-linha. — */}
          <Card>
            <CardHeader>
              <CardTitle>O ritmo dos últimos meses</CardTitle>
              <CardDescription>
                Saldo de caixa por mês — independente do período filtrado acima.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pagamentosTendencia.isError ? (
                <ErroListagem
                  mensagem="Falha ao buscar a tendência."
                  onRetry={() => pagamentosTendencia.refetch()}
                />
              ) : (
                <ol className="divide-y">
                  {tendencia.map((ponto) => {
                    const atual = ponto.competencia === competenciaHoje;
                    const neg = ponto.saldo < 0;
                    return (
                      <li
                        key={ponto.competencia}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span
                            className={`text-sm capitalize ${atual ? "font-medium text-primary" : ""}`}
                          >
                            {rotuloCompetencia(ponto.competencia)}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            + R$ {brl(ponto.entradas)} · − R$ {brl(ponto.saidas)}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 tabular-nums ${
                            neg ? "text-destructive" : "text-foreground"
                          }`}
                        >
                          R$ {brl(ponto.saldo)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* — Linha do tempo do período — */}
          <Card>
            <CardHeader>
              <CardTitle>Movimentos</CardTitle>
              <CardDescription>{periodoFmt}</CardDescription>
            </CardHeader>
            <CardContent>
              {linhaDoTempo.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum movimento neste período.
                </p>
              ) : (
                <ul className="divide-y">
                  {linhaDoTempo.map((m) => {
                    const entrada = m.tipo === "ENTRADA";
                    return (
                      <li key={m.id} className="flex items-baseline justify-between gap-3 py-3">
                        <div className="flex min-w-0 items-baseline gap-3">
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {instanteFmt.format(new Date(m.data))}
                          </span>
                          <div className="flex min-w-0 flex-col">
                            {m.href ? (
                              <Link to={m.href} className="w-fit truncate text-sm hover:underline">
                                {m.descricao}
                              </Link>
                            ) : (
                              <span className="truncate text-sm">{m.descricao}</span>
                            )}
                            {m.rotulo && (
                              <span className="truncate text-xs text-muted-foreground">
                                {m.rotulo}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 tabular-nums ${
                            entrada ? "text-positivo" : "text-destructive"
                          }`}
                        >
                          {entrada ? "+" : "−"} R$ {brl(m.valor)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
