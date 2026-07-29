import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useGetDre, getGetDreQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErroListagem } from "./helpers";
import { useCaminhoDaLoja } from "@/hooks/use-caminho-da-loja";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { brl, capitalizar } from "@/lib/formatos";
import { rotuloForma } from "@/lib/financeiro/forma";
import { RecebimentosPorFormaLista } from "@/components/recebimentos-por-forma";
import { baixarCsv, linhasDre } from "@/lib/financeiro/exportar";
import { competenciaAtual, competenciaValida, rotuloCompetencia, ultimasCompetencias } from "@/lib/financeiro/datas";

/**
 * DRE em REGIME DE CAIXA: só entra no número o dinheiro que se moveu dentro da
 * competência — parcela efetivamente recebida menos pagamento efetivamente
 * feito. O previsto não aparece aqui de propósito; ele vive no fluxo.
 *
 * A agregação roda no banco (E79): GET /financeiro/dre passa o MESMO
 * `dreDoIntervalo` (financeiro-core) sobre a competência recortada no SQL.
 * Esta tela só escolhe a competência, busca e desenha.
 */

const MESES_NO_SELETOR = 12;

// `mesFmt` morava aqui, declarado e nunca usado: a tela formata competência por
// `rotuloCompetencia`, que já embrulha um formatador idêntico. Régua morta ao
// lado da viva é convite para a próxima linha usar a errada.

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

  // E79: a agregação inteira roda no banco — o MESMO motor (dreDoIntervalo),
  // sobre a competência recortada no SQL. A tela pede o mês, não a história.
  const paramsDre = { competencia };
  const dreQ = useGetDre(activeLojaId!, paramsDre, {
    query: {
      queryKey: getGetDreQueryKey(activeLojaId!, paramsDre),
      enabled: !!activeLojaId,
      placeholderData: keepPreviousData,
    },
  });

  const dre = dreQ.data ?? { receitas: 0, despesas: [], totalDespesas: 0, resultado: 0 };

  // Mesmo filtro do DRE no servidor (entradasDoIntervalo): `porForma.total` e
  // `dre.receitas` são o mesmo dinheiro, visto por outro corte. O rótulo é
  // vocabulário de TELA, o servidor fala o código cru.
  const porForma = useMemo(
    () => ({
      total: dreQ.data?.porMeio.total ?? 0,
      linhas: (dreQ.data?.porMeio.linhas ?? []).map((l) => ({
        forma: l.forma,
        rotulo: l.forma ? (rotuloForma(l.forma) ?? l.forma) : "Não informado",
        total: l.total,
        qtd: l.qtd,
      })),
    }),
    [dreQ.data],
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

  const carregando = dreQ.isPending;
  const erro = dreQ.isError;
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
              <SelectItem key={c} value={c}>
                {capitalizar(rotuloCompetencia(c))}
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
          onRetry={() => dreQ.refetch()}
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
          {/* E14: o resultado é a PERGUNTA da tela — quem abre o DRE quer saber
              se sobrou, e a resposta morava no rodapé, depois de três cartões.
              Agora ele é o herói e as duas metades ficam abaixo, explicando-o.
              O padrão é o de `fluxo.tsx`, que já resolvia isso. */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sobrou em {rotuloCompetencia(competencia)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <p
                className={`money-lg text-4xl ${resultadoNegativo ? "text-destructive" : "text-positivo"}`}
                data-testid="dre-resultado"
              >
                {resultadoNegativo ? "−" : "+"}
                {brl(Math.abs(dre.resultado))}
              </p>
              <p className="text-sm text-muted-foreground">
                {brl(dre.receitas)} recebidos menos {brl(dre.totalDespesas)} pagos.
                {resultadoNegativo && " O mês fechou no vermelho."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recebimentos</CardTitle>
              <CardDescription>Parcelas recebidas no mês.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="money-md text-positivo">
                {brl(dre.receitas)}
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
                        − {brl(despesa.total)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-4 pt-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      Total de despesas
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-destructive">
                      − {brl(dre.totalDespesas)}
                    </span>
                  </li>
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
