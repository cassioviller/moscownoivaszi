import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetFluxoCaixa,
  getGetFluxoCaixaQueryKey,
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
import { brl, capitalizar } from "@/lib/formatos";
import { rotuloForma } from "@/lib/financeiro/forma";
import { RecebimentosPorFormaLista } from "@/components/recebimentos-por-forma";
import { baixarCsv, linhasFluxo } from "@/lib/financeiro/exportar";
import { resolverIntervalo, competenciaAtual, rotuloCompetencia } from "@/lib/financeiro/datas";

/**
 * Fluxo de caixa — o hub do financeiro: o que DE FATO entrou e saiu do caixa do
 * atelier no período (realizado, pela data do movimento), o ritmo dos últimos
 * meses e a linha do tempo dos movimentos. Leitura pura: nenhuma ação daqui
 * muda dado. Não é extrato bancário — sem saldo inicial e sem conciliação.
 *
 * Toda a agregação roda no banco (E79): o endpoint /financeiro/fluxo passa os
 * MESMOS motores do núcleo (E25) sobre linhas já filtradas por data. Esta tela
 * só resolve o intervalo, busca e desenha.
 */

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

  // E79: a agregação inteira roda no banco — os MESMOS motores (E25), sobre
  // linhas filtradas por data no SQL. A tela pede a janela, não a história.
  const paramsFluxo = { ini: intervalo.iniYMD, fim: intervalo.fimYMD };
  const fluxoQ = useGetFluxoCaixa(activeLojaId!, paramsFluxo, {
    query: {
      queryKey: getGetFluxoCaixaQueryKey(activeLojaId!, paramsFluxo),
      enabled: !!activeLojaId,
      placeholderData: keepPreviousData,
    },
  });

  const resumo = fluxoQ.data?.resumo ?? { entradas: 0, saidas: 0, saldo: 0 };
  const horizonte = fluxoQ.data?.horizonte ?? {
    aReceber: 0,
    aReceberAtraso: 0,
    aPagar: 0,
    aPagarAtraso: 0,
  };
  const tendencia = fluxoQ.data?.tendencia ?? [];

  // O shape que a lista por meio (E50) consome — o rótulo é vocabulário de
  // TELA, o servidor fala o código cru.
  const porForma = useMemo(
    () => ({
      total: fluxoQ.data?.porMeio.total ?? 0,
      linhas: (fluxoQ.data?.porMeio.linhas ?? []).map((l) => ({
        forma: l.forma,
        rotulo: l.forma ? (rotuloForma(l.forma) ?? l.forma) : "Não informado",
        total: l.total,
        qtd: l.qtd,
      })),
    }),
    [fluxoQ.data],
  );

  // O href é decisão de navegação (tela); o servidor entrega o contratoId.
  const linhaDoTempo = useMemo(
    () =>
      (fluxoQ.data?.movimentos ?? []).map((m) => ({
        ...m,
        rotulo: m.rotulo ?? null,
        href: m.contratoId
          ? `/loja/${activeLojaId}/contratos/${m.contratoId}`
          : m.tipo === "SAIDA"
            ? `/loja/${activeLojaId}/financeiro/pagar`
            : null,
      })),
    [fluxoQ.data, activeLojaId],
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

  // Uma query, um estado: o endpoint entrega resumo, horizonte, tendência e
  // movimentos numa tacada (E79). Sem sucesso parcial — ou tudo carregou, ou o
  // erro de topo cobre a tela.
  const carregando = fluxoQ.isPending;
  const erro = fluxoQ.isError;
  const saldoNegativo = resumo.saldo < 0;
  const periodoFmt = `${rotuloDia(intervalo.iniYMD)} – ${rotuloDia(intervalo.fimYMD)}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {/* E82: o H1 conta a mesma história do menu — quem clica em
            "Financeiro" chega no Financeiro; o fluxo de caixa é a lente. */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-serif">Financeiro</h1>
          <Badge variant="secondary">Realizado</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Fluxo de caixa: o que entrou e saiu do atelier — pelo que foi registrado aqui, não é o
          extrato do banco.
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
          {/* E92/F31: a folha do mês era a única tela do financeiro sem porta
              de entrada aqui — só se chegava nela pela sidebar. */}
          <Link to="folha" className="text-muted-foreground hover:text-foreground">
            Folha do mês →
          </Link>
          <Link to="auditoria" className="text-muted-foreground hover:text-foreground">
            Auditoria →
          </Link>
          <Link to="conciliacao" className="text-muted-foreground hover:text-foreground">
            Conciliação →
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
          onRetry={() => fluxoQ.refetch()}
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
                <p className="money-md text-positivo">
                  {brl(resumo.entradas)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saídas</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="money-md text-destructive">
                  {brl(resumo.saidas)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Saldo</CardDescription>
              </CardHeader>
              <CardContent>
                <p
                  className={`money-md ${saldoNegativo ? "text-destructive" : "text-positivo"}`}
                >
                  {brl(resumo.saldo)}
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
          <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Link to="receber" className="rounded-lg border p-4 transition-colors hover:border-primary">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">A receber</p>
                  <p className="text-xl font-semibold tabular-nums">{brl(horizonte.aReceber)}</p>
                  {horizonte.aReceberAtraso > 0 && (
                    <p className="text-xs text-destructive">{brl(horizonte.aReceberAtraso)} em atraso</p>
                  )}
                </Link>
                <Link to="pagar" className="rounded-lg border p-4 transition-colors hover:border-primary">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">A pagar</p>
                  <p className="text-xl font-semibold tabular-nums">{brl(horizonte.aPagar)}</p>
                  {horizonte.aPagarAtraso > 0 && (
                    <p className="text-xs text-destructive">{brl(horizonte.aPagarAtraso)} em atraso</p>
                  )}
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Previsão pelo vencimento — ainda não passou pelo caixa.
              </p>
            </>

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
                            className={`text-sm ${atual ? "font-medium text-primary" : ""}`}
                          >
                            {capitalizar(rotuloCompetencia(ponto.competencia))}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            + {brl(ponto.entradas)} · − {brl(ponto.saidas)}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 tabular-nums ${
                            neg ? "text-destructive" : "text-foreground"
                          }`}
                        >
                          {brl(ponto.saldo)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
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
                          {entrada ? "+" : "−"} {brl(m.valor)}
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
