import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useGetConversaoLeads, getGetConversaoLeadsQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EstadoErro } from "@/components/estado-erro";
import { origemLabel, perdidaMotivoLabel } from "@/lib/formatos";

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

  const dados = q.data;
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
        <EstadoErro titulo="Erro ao carregar a conversão" erro={q.error} onTentarNovamente={() => q.refetch()} />
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
        </>
      )}
    </div>
  );
}
