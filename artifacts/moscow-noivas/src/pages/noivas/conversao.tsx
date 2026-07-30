import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetConversaoLeads,
  getGetConversaoLeadsQueryKey,
  useGetSazonalidadeCasamentos,
  getGetSazonalidadeCasamentosQueryKey,
  useGetDesempenhoVendedoras,
  getGetDesempenhoVendedorasQueryKey,
} from "@workspace/api-client-react";
import { brl } from "@/lib/formatos";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Erro } from "@/components/estado";
import { capitalizar, origemLabel, perdidaMotivoLabel } from "@/lib/formatos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Relatório de conversão (E34): o consumidor que faltava para o motivo de perda
 * (E4) e a origem (E19). Responde "quanto o site trouxe e quantos fecharam" e
 * "por que as noivas não fecham" — dois agregados que o backend já calcula.
 */

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/** Barra proporcional simples — sem biblioteca de gráfico, no tom da tela. */
function Barra({ fracao, className }: { fracao: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${className ?? "bg-primary"}`}
        style={{ width: `${Math.max(0, Math.min(100, fracao))}%` }}
      />
    </div>
  );
}

export default function ConversaoLeads() {
  const { activeLojaId } = useAuth();
  const { lojaId } = useParams();

  const q = useGetConversaoLeads(activeLojaId!, {
    query: { queryKey: getGetConversaoLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  // E73: a demanda de arara dos próximos 12 meses — a data do casamento
  // sempre esteve no banco, faltava somar.
  const sazonalidade = useGetSazonalidadeCasamentos(activeLojaId!, {
    query: {
      queryKey: getGetSazonalidadeCasamentosQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  // E73: o caminho de cada vendedora — atendimentos, "reservou" e contratos.
  const desempenho = useGetDesempenhoVendedoras(activeLojaId!, {
    query: {
      queryKey: getGetDesempenhoVendedorasQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  const dados = q.data;
  const maiorMes = Math.max(1, ...(sazonalidade.data ?? []).map((m) => m.total));

    // A competência já é ancorada ao meio-dia de SP na linha abaixo, então o fuso
  // não mudava a resposta — mas deixá-lo implícito era o convite para a próxima
  // cópia deste formatador nascer sem âncora nenhuma.
  const mesFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
  const rotuloMes = (competencia: string) =>
    mesFmt.format(new Date(`${competencia}-15T12:00:00-03:00`));
  const maiorMotivo = dados ? Math.max(1, ...dados.porMotivoPerda.map((m) => m.total)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/loja/${lojaId}/noivas`} className="text-sm text-muted-foreground hover:text-primary">
          ← Noivas
        </Link>
        <h1 className="text-3xl font-serif mt-1">Conversão</h1>
        <p className="text-sm text-muted-foreground mt-1">
          De onde as noivas vêm, quantas fecham e por que as outras se perdem.
        </p>
      </div>

      {q.isError ? (
        <Erro titulo="Não deu para carregar a conversão" erro={q.error} onTentarNovamente={() => q.refetch()} />
      ) : q.isPending || !dados ? (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : dados.totalLeads === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma noiva cadastrada ainda.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Noivas</p>
                <p className="text-3xl font-serif">{dados.totalLeads}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Fecharam</p>
                <p className="text-3xl font-serif text-emerald-600 dark:text-emerald-400">
                  {dados.convertidos}
                  <span className="text-base text-muted-foreground"> · {pct(dados.convertidos, dados.totalLeads)}%</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Perderam</p>
                <p className="text-3xl font-serif text-muted-foreground">
                  {dados.perdidos}
                  <span className="text-base"> · {pct(dados.perdidos, dados.totalLeads)}%</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Por origem</CardTitle>
                <CardDescription>Quantas cada canal trouxe e a taxa de fechamento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[...dados.porOrigem]
                  .sort((a, b) => b.total - a.total)
                  .map((o) => (
                    <div key={o.origem} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{origemLabel(o.origem)}</span>
                        <span className="text-muted-foreground">
                          {o.convertidos}/{o.total} fecharam · {pct(o.convertidos, o.total)}%
                        </span>
                      </div>
                      <Barra fracao={pct(o.convertidos, o.total)} className="bg-emerald-500" />
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Por que se perderam</CardTitle>
                <CardDescription>Motivo registrado ao marcar a noiva como perdida.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {dados.porMotivoPerda.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma noiva perdida — que ótimo.</p>
                ) : (
                  [...dados.porMotivoPerda]
                    .sort((a, b) => b.total - a.total)
                    .map((m) => (
                      <div key={m.motivo ?? "SEM_MOTIVO"} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium">
                            {m.motivo ? perdidaMotivoLabel(m.motivo) : "Não informado"}
                          </span>
                          <span className="text-muted-foreground">{m.total}</span>
                        </div>
                        <Barra fracao={pct(m.total, maiorMotivo)} className="bg-muted-foreground/60" />
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quando são os casamentos</CardTitle>
              <CardDescription>
                Próximos 12 meses — a curva que diz quando faltará vestido e quando
                sobrará arara. A parte cheia da barra já tem contrato.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(sazonalidade.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum casamento com data marcada nos próximos meses.
                </p>
              ) : (
                (sazonalidade.data ?? []).map((m) => (
                  <div key={m.competencia} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{capitalizar(rotuloMes(m.competencia))}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {m.comContrato} com contrato · {m.total} no total
                      </span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
                        style={{ width: `${pct(m.total, maiorMes)}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-primary"
                        style={{ width: `${pct(m.comContrato, maiorMes)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {(desempenho.data ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>O caminho de cada vendedora</CardTitle>
                <CardDescription>
                  Do atendimento ao contrato — a comissão mede o resultado; isto mede o
                  caminho.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b text-left text-xs text-muted-foreground">
                      <TableHead className="py-2 pr-3 font-normal">Vendedora</TableHead>
                      <TableHead className="py-2 px-3 font-normal text-right">Atendimentos</TableHead>
                      <TableHead className="py-2 px-3 font-normal text-right">Reservou</TableHead>
                      <TableHead className="py-2 px-3 font-normal text-right">Contratos</TableHead>
                      <TableHead className="py-2 px-3 font-normal text-right">Receita</TableHead>
                      <TableHead className="py-2 pl-3 font-normal text-right">Ticket médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(desempenho.data ?? []).map((v) => (
                      <TableRow key={v.vendedoraId} className="border-b last:border-0">
                        <TableCell className="py-2.5 pr-3 font-medium">{v.nome}</TableCell>
                        <TableCell className="py-2.5 px-3 text-right tabular-nums">
                          {v.atendimentosConcluidos}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right tabular-nums">
                          {v.reservou}
                          {v.atendimentosConcluidos > 0 && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({pct(v.reservou, v.atendimentosConcluidos)}%)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right tabular-nums">{v.contratos}</TableCell>
                        <TableCell className="py-2.5 px-3 text-right tabular-nums">
                          {v.receita > 0 ? `${brl(v.receita)}` : "—"}
                        </TableCell>
                        <TableCell className="py-2.5 pl-3 text-right tabular-nums">
                          {v.contratos > 0 ? `${brl(v.receita / v.contratos)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
