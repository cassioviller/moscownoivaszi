import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetUtilizacaoVestidos,
  getGetUtilizacaoVestidosQueryKey,
  type VestidoUtilizacao,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { brl } from "@/lib/formatos";

/**
 * Utilização por vestido (E15) — o relatório da dona: quantas provas, reservas
 * e contratos cada vestido gerou no período, com a receita. A ordenação põe as
 * estrelas no topo; os sem uso descem juntos para o fim — eles são a resposta
 * de "o que sai de linha e o que merece réplica".
 */

const PERIODOS = {
  "90d": { rotulo: "Últimos 90 dias", dias: 90 },
  "12m": { rotulo: "Últimos 12 meses", dias: 365 },
  tudo: { rotulo: "Tudo", dias: null },
} as const;
type Periodo = keyof typeof PERIODOS;

function diaISO(offsetDias: number): string {
  return new Date(Date.now() + offsetDias * 86_400_000).toISOString().slice(0, 10);
}

function usoTotal(v: VestidoUtilizacao): number {
  return v.provas + v.reservas + v.contratos;
}

export default function UtilizacaoVestidos() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const periodoParam = searchParams.get("periodo");
  const periodo: Periodo = periodoParam && periodoParam in PERIODOS ? (periodoParam as Periodo) : "12m";

  const params = useMemo(() => {
    const dias = PERIODOS[periodo].dias;
    return dias ? { de: diaISO(-dias), ate: diaISO(0) } : {};
  }, [periodo]);

  const utilizacao = useGetUtilizacaoVestidos(activeLojaId!, params, {
    query: {
      queryKey: getGetUtilizacaoVestidosQueryKey(activeLojaId!, params),
      enabled: !!activeLojaId,
    },
  });

  const { linhas, semUso, curvaPorVestido } = useMemo(() => {
    const todas = [...(utilizacao.data ?? [])];
    // Receita manda; empate decide por contratos, depois demanda (provas+reservas).
    todas.sort(
      (a, b) =>
        b.receita - a.receita ||
        b.contratos - a.contratos ||
        usoTotal(b) - usoTotal(a) ||
        a.nome.localeCompare(b.nome),
    );
    // E73: curva ABC pela participação ACUMULADA na receita — A carrega até
    // 80% do faturamento, B até 95%, C é cauda (e quem não faturou nada).
    const receitaTotal = todas.reduce((soma, v) => soma + v.receita, 0);
    const curva = new Map<string, "A" | "B" | "C">();
    let acumulado = 0;
    for (const v of todas) {
      acumulado += v.receita;
      const classe =
        v.receita <= 0 || receitaTotal === 0
          ? "C"
          : acumulado / receitaTotal <= 0.8
            ? "A"
            : acumulado / receitaTotal <= 0.95
              ? "B"
              : "C";
      curva.set(v.vestidoId, classe);
    }
    return {
      linhas: todas,
      semUso: todas.filter((v) => usoTotal(v) === 0).length,
      curvaPorVestido: curva,
    };
  }, [utilizacao.data]);

  const trocarPeriodo = (novo: Periodo) => {
    const proximo = new URLSearchParams(searchParams);
    if (novo === "12m") proximo.delete("periodo");
    else proximo.set("periodo", novo);
    setSearchParams(proximo, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to={`/loja/${lojaId}/vestidos`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Catálogo
          </Link>
          <h1 className="text-3xl font-serif">Utilização do acervo</h1>
          <p className="text-sm text-muted-foreground">
            Provas, reservas e contratos por vestido — quem paga o aluguel e quem só ocupa arara.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
            <Button
              key={p}
              variant={periodo === p ? "secondary" : "ghost"}
              size="sm"
              onClick={() => trocarPeriodo(p)}
            >
              {PERIODOS[p].rotulo}
            </Button>
          ))}
        </div>
      </div>

      {utilizacao.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar a utilização</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>
              {utilizacao.error instanceof Error ? utilizacao.error.message : "Falha inesperada."}
            </span>
            <Button variant="outline" size="sm" onClick={() => utilizacao.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : utilizacao.isPending ? (
        <Skeleton className="h-72 rounded-lg" />
      ) : linhas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">
          Nenhum vestido cadastrado no catálogo.
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {linhas.length} vestido{linhas.length === 1 ? "" : "s"} no acervo
            </CardTitle>
            {semUso > 0 && (
              <CardDescription>
                {semUso} sem nenhum uso no período — candidatos a sair de linha.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-normal">Vestido</th>
                  <th className="py-2 px-3 font-normal text-right">Provas</th>
                  <th className="py-2 px-3 font-normal text-right">Reservas</th>
                  <th className="py-2 px-3 font-normal text-right">Contratos</th>
                  <th className="py-2 pl-3 font-normal text-right">Receita</th>
                  <th className="py-2 pl-3 font-normal text-right" title="Curva ABC: A carrega 80% da receita, B até 95%, C é cauda">
                    Curva
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((v) => {
                  const parado = usoTotal(v) === 0;
                  return (
                    <tr
                      key={v.vestidoId}
                      className={`border-b last:border-0 ${parado ? "text-muted-foreground" : ""}`}
                    >
                      <td className="py-2.5 pr-3">
                        <Link
                          to={`/loja/${lojaId}/vestidos/${v.vestidoId}`}
                          className="hover:underline"
                        >
                          <span className="tabular-nums text-muted-foreground">{v.codigo}</span>{" "}
                          {v.nome}
                        </Link>
                        {v.status !== "ativo" && (
                          <Badge variant="secondary" className="ml-2 font-normal">
                            {v.status}
                          </Badge>
                        )}
                        {parado && (
                          <Badge variant="outline" className="ml-2 font-normal">
                            sem uso
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{v.provas}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{v.reservas}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{v.contratos}</td>
                      <td className="py-2.5 pl-3 text-right tabular-nums">
                        {v.receita > 0 ? `R$ ${brl(v.receita)}` : "—"}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <Badge
                          variant={
                            curvaPorVestido.get(v.vestidoId) === "A"
                              ? "default"
                              : curvaPorVestido.get(v.vestidoId) === "B"
                                ? "secondary"
                                : "outline"
                          }
                          className="font-normal"
                        >
                          {curvaPorVestido.get(v.vestidoId)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
