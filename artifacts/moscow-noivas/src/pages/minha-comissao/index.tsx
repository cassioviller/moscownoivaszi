import { useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetMinhaComissao,
  getGetMinhaComissaoQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { brl, instanteDia } from "@/lib/formatos";
import { competenciaAtual, rotuloCompetencia, ultimasCompetencias } from "@/lib/financeiro/datas";
import { capitalizar } from "@/lib/formatos";

/**
 * Minha comissão (E11): o extrato da PRÓPRIA pessoa logada — quanto vendeu,
 * quanto vai receber e quanto falta para o próximo degrau. A tela de gestão
 * (/comissoes) mostra todo mundo e exige o módulo comissao; esta não.
 */
export default function MinhaComissao() {
  const { activeLojaId, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const competencia = searchParams.get("competencia") ?? competenciaAtual();
  const competencias = ultimasCompetencias(competenciaAtual(), 12).reverse();

  const extrato = useGetMinhaComissao(activeLojaId!, { competencia }, {
    query: {
      queryKey: getGetMinhaComissaoQueryKey(activeLojaId!, { competencia }),
      enabled: !!activeLojaId,
    },
  });

  const d = extrato.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">Minha comissão</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.nome ? `${user.nome} — ` : ""}o que o mês está construindo e o que já fechou.
          </p>
        </div>
        <Select
          value={competencia}
          onValueChange={(v) => setSearchParams(v === competenciaAtual() ? {} : { competencia: v })}
        >
          <SelectTrigger className="w-56" aria-label="Competência">
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
      </div>

      {extrato.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não deu para carregar o extrato</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar sua comissão.</span>
            <Button variant="outline" size="sm" onClick={() => extrato.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : extrato.isLoading || !d ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Vendas do mês</CardDescription>
                <p className="money-lg">
                  {brl(d.totalVendas)}
                </p>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {d.estornoPendente > 0
                  ? `Já com ${brl(d.estornoPendente)} de estorno abatido (cancelamento de mês já pago).`
                  : "Contratos fechados nesta competência."}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Comissão prevista</CardDescription>
                <p className="money-lg">
                  {brl(d.valorTotal)}
                </p>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {!d.temRegra
                  ? "Sem escada de comissão vigente — fale com a administração."
                  : d.percentualAplicado !== null && d.percentualAplicado !== undefined
                    ? `Faixa de ${d.percentualAplicado}%${d.valorBonus ? ` + bônus ${brl(d.valorBonus)}` : ""} — se o mês fechasse agora.`
                    : "Nenhuma faixa atingida ainda."}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Próximo degrau</CardDescription>
                <p className="money-lg">
                  {d.faltaProximoDegrau !== null && d.faltaProximoDegrau !== undefined
                    ? `${brl(d.faltaProximoDegrau)}`
                    : d.temRegra
                      ? "No topo"
                      : "—"}
                </p>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {d.faltaProximoDegrau !== null && d.faltaProximoDegrau !== undefined
                  ? `Faltam de venda para a faixa${d.proximoDegrauPercentual ? ` de ${d.proximoDegrauPercentual}%` : " seguinte"} — ela vale para o mês INTEIRO.`
                  : d.temRegra
                    ? "Você já está na maior faixa da escada."
                    : "Sem escada vigente nesta competência."}
              </CardContent>
            </Card>
          </div>

          {/* E55: a colocação, sem os valores das colegas. O ranking já
              existia atrás do gate de gestão — a vendedora não podia ver onde
              está sem ganhar acesso a quanto todo mundo ganha. */}
          {d.colocacao && (
            <p className="text-sm text-muted-foreground" data-testid="colocacao">
              Você está em{" "}
              <span className="font-medium text-foreground">
                {d.colocacao.posicao}º de {d.colocacao.de}
              </span>{" "}
              na loja neste mês.
            </p>
          )}

          {/* E51: "no seu ritmo, o mês fecha em Y%". O card acima diz o que
              vale HOJE; este diz para onde o mês está indo — que é o que dá
              tempo de mudar o resultado, em vez de descobrir no dia 30. */}
          {d.projecao && (
            <Card data-testid="projecao-comissao">
              <CardHeader className="pb-2">
                <CardDescription>No seu ritmo</CardDescription>
                <p className="money-lg">
                  {brl(d.projecao.valorTotalProjetado)}
                </p>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Com {d.projecao.diasDecorridos} de {d.projecao.diasNoMes} dias, o mês caminha
                  para{" "}
                  <span className="font-medium tabular-nums">
                    {brl(d.projecao.baseProjetada)}
                  </span>{" "}
                  em vendas
                  {d.projecao.percentualProjetado !== null &&
                  d.projecao.percentualProjetado !== undefined ? (
                    <>
                      {" "}
                      — faixa de{" "}
                      <span className="font-medium">{d.projecao.percentualProjetado}%</span>
                      {d.percentualAplicado !== null &&
                        d.percentualAplicado !== undefined &&
                        d.projecao.percentualProjetado > d.percentualAplicado && (
                          <> , acima dos {d.percentualAplicado}% de agora</>
                        )}
                    </>
                  ) : (
                    <> — ainda sem faixa atingida</>
                  )}
                  .
                </p>
                {/* Projeção não é promessa: é o ritmo de hoje repetido até o
                    fim do mês. Dizer isso é o que a impede de ser lida como
                    valor a receber. */}
                <p>É o ritmo atual repetido até o fim do mês, não uma garantia.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Meses fechados</CardTitle>
              <CardDescription>O que já virou pagamento, mais recente primeiro.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.fechamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma competência sua foi fechada ainda.
                </p>
              ) : (
                <ul className="divide-y">
                  {d.fechamentos.map((f) => (
                    <li
                      key={f.competencia}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{capitalizar(rotuloCompetencia(f.competencia))}</p>
                        <p className="text-xs text-muted-foreground">
                          Vendeu {brl(f.totalVendas)}
                          {f.percentualAplicado !== null && f.percentualAplicado !== undefined
                            ? ` · ${f.percentualAplicado}%`
                            : ""}
                          {!!f.valorBonus && ` · bônus ${brl(f.valorBonus)}`}
                          {` · fechado em ${instanteDia(f.fechadoEm)}`}
                        </p>
                      </div>
                      <span className="shrink-0 font-serif text-xl tabular-nums">
                        {brl(f.valorTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
