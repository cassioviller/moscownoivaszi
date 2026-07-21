import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListParcelas,
  getListParcelasQueryKey,
  useListPagamentos,
  getListPagamentosQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErroListagem, useCaminhoDaLoja } from "./helpers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { brl } from "@/lib/formatos";
import { dreDoIntervalo } from "@/lib/financeiro/dre";
import { recebimentosPorForma } from "@/lib/financeiro/forma";
import { RecebimentosPorFormaLista } from "@/components/recebimentos-por-forma";
import { baixarCsv, linhasDre } from "@/lib/financeiro/exportar";
import {
  competenciaAtual,
  competenciaValida,
  intervaloDaCompetencia,
  ultimasCompetencias,
} from "@/lib/financeiro/datas";

/**
 * DRE em REGIME DE CAIXA: só entra no número o dinheiro que se moveu dentro da
 * competência — parcela efetivamente recebida menos pagamento efetivamente
 * feito. O previsto não aparece aqui de propósito; ele vive no fluxo.
 *
 * A agregação inteira é do núcleo (`dreDoIntervalo`), já testado. Esta tela só
 * escolhe o intervalo, busca e desenha.
 */

const MESES_NO_SELETOR = 12;

const mesFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-07" → "julho de 2026". Meio-dia UTC evita escorregar de mês. */
function rotuloCompetencia(competencia: string): string {
  return mesFmt.format(new Date(`${competencia}-01T12:00:00.000Z`));
}

/** Desloca uma competência em `n` meses. */
function deslocarCompetencia(competencia: string, n: number): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7)); // 1..12
  const d = new Date(Date.UTC(ano, mes - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}


export default function DRE() {
  const naLoja = useCaminhoDaLoja();
  const { activeLojaId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const compParam = searchParams.get("comp");
  const competencia = competenciaValida(compParam ?? "") ? compParam! : competenciaAtual();
  const intervalo = useMemo(() => intervaloDaCompetencia(competencia), [competencia]);

  // Sem janela de propósito: o DRE é por competência, não por vencimento.
  const parcelas = useListParcelas(activeLojaId!, undefined, {
    query: {
      queryKey: getListParcelasQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  const paramsPagamentos = { de: intervalo.iniYMD, ate: intervalo.fimYMD };
  const pagamentos = useListPagamentos(activeLojaId!, paramsPagamentos, {
    query: {
      queryKey: getListPagamentosQueryKey(activeLojaId!, paramsPagamentos),
      enabled: !!activeLojaId,
    },
  });

  const dre = useMemo(
    () => dreDoIntervalo(parcelas.data ?? [], pagamentos.data ?? [], intervalo),
    [parcelas.data, pagamentos.data, intervalo],
  );

  // Mesmo filtro do DRE (entradasDoIntervalo): `porForma.total` e
  // `dre.receitas` são o mesmo dinheiro, visto por outro corte.
  const porForma = useMemo(
    () => recebimentosPorForma(parcelas.data ?? [], intervalo),
    [parcelas.data, intervalo],
  );

  /** Últimos 12 meses; se a URL apontar para fora da janela, a opção entra mesmo assim. */
  const competencias = useMemo(() => {
    const janela = ultimasCompetencias(competenciaAtual(), MESES_NO_SELETOR);
    const todas = janela.includes(competencia) ? janela : [...janela, competencia].sort();
    return todas.reverse(); // mais recente primeiro
  }, [competencia]);

  function irPara(novaComp: string) {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        proximo.set("comp", novaComp);
        return proximo;
      },
      { replace: true },
    );
  }

  const carregando = parcelas.isPending || pagamentos.isPending;
  const erro = parcelas.isError || pagamentos.isError;
  const resultadoNegativo = dre.resultado < 0;
  const vazio = dre.receitas === 0 && dre.despesas.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link to={naLoja("/financeiro")} className="text-sm text-muted-foreground hover:text-foreground">
          ← Financeiro
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-serif">Resultado do mês</h1>
          <Badge variant="secondary">Regime de caixa</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          O que entrou, para onde foi e quanto sobrou — pelo dinheiro que de fato se moveu no mês.
          Valores previstos não entram aqui.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Mês anterior"
          onClick={() => irPara(deslocarCompetencia(competencia, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select value={competencia} onValueChange={irPara}>
          <SelectTrigger className="w-[220px]" aria-label="Competência">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {competencias.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {rotuloCompetencia(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label="Próximo mês"
          onClick={() => irPara(deslocarCompetencia(competencia, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {/* E22: o CSV nasce dos MESMOS números da tela (dreDoIntervalo). */}
        <Button
          variant="outline"
          size="sm"
          disabled={carregando || erro || vazio}
          onClick={() => baixarCsv(`dre-${competencia}.csv`, linhasDre(dre, competencia, porForma))}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {erro ? (
        <ErroListagem
          mensagem="Falha ao buscar os lançamentos do mês."
          onRetry={() => {
            if (parcelas.isError) parcelas.refetch();
            if (pagamentos.isError) pagamentos.refetch();
          }}
        />
      ) : carregando ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : vazio ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum movimento de caixa em {rotuloCompetencia(competencia)}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recebimentos</CardTitle>
              <CardDescription>Parcelas recebidas no mês.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-positivo">
                R$ {brl(dre.receitas)}
              </p>
            </CardContent>
          </Card>

          {/* E50: o mesmo dinheiro, por MEIO — é aqui que a taxa do cartão
              encontra a maquininha e o Pix encontra o extrato. */}
          <Card>
            <CardHeader>
              <CardTitle>Recebimentos por meio</CardTitle>
              <CardDescription>Para conciliar cartão, Pix e caixa físico.</CardDescription>
            </CardHeader>
            <CardContent>
              <RecebimentosPorFormaLista dados={porForma} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Despesas por categoria</CardTitle>
              <CardDescription>Pagamentos feitos no mês.</CardDescription>
            </CardHeader>
            <CardContent>
              {dre.despesas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma despesa neste mês.</p>
              ) : (
                <ul className="space-y-2">
                  {dre.despesas.map((despesa) => (
                    <li
                      key={despesa.rotulo}
                      className="flex items-center justify-between gap-4 border-b pb-2"
                    >
                      <span className="min-w-0 truncate">{despesa.rotulo}</span>
                      <span className="shrink-0 tabular-nums text-destructive">
                        − R$ {brl(despesa.total)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-4 pt-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      Total de despesas
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-destructive">
                      − R$ {brl(dre.totalDespesas)}
                    </span>
                  </li>
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resultado do mês</CardTitle>
              <CardDescription>Recebimentos menos despesas, pelo caixa.</CardDescription>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-semibold tabular-nums ${
                  resultadoNegativo ? "text-destructive" : "text-positivo"
                }`}
              >
                R$ {brl(dre.resultado)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
