import { useAuth } from "@/hooks/use-auth";
import {
  useGetAtividadeEquipe,
  getGetAtividadeEquipeQueryKey,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoErro } from "@/components/estado-erro";
import { ROTULO_ACAO, resumoDetalhe } from "../financeiro/auditoria";

/**
 * Log de atividade da equipe (E18) — o card da dona na tela de Equipe: quando
 * cada membro entrou pela última vez e o feed das ações sensíveis (a trilha do
 * E10, aqui pela lente "quem anda fazendo o quê", não "o que houve com o
 * dinheiro").
 */

const quandoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "há 5 min", "há 3 h", "há 12 dias" — ou null para cair na data absoluta. */
function haQuanto(instante: string): string | null {
  const ms = Date.now() - new Date(instante).getTime();
  if (ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias <= 60) return `há ${dias} dia${dias === 1 ? "" : "s"}`;
  return null;
}

export function AtividadeEquipe() {
  const { activeLojaId } = useAuth();

  const atividade = useGetAtividadeEquipe(activeLojaId!, {
    query: {
      queryKey: getGetAtividadeEquipeQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade da equipe</CardTitle>
        <CardDescription>
          Último acesso de cada membro e as ações sensíveis recentes — o rastro do audit_log, pela
          lente de quem gere a equipe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {atividade.isError ? (
          <EstadoErro
            titulo="Erro ao carregar a atividade"
            erro={atividade.error}
            onTentarNovamente={() => atividade.refetch()}
          />
        ) : atividade.isPending ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded-md" />
            ))}
          </div>
        ) : (
          <>
            <ul className="divide-y">
              {atividade.data.membros.map((m) => (
                <li key={m.usuarioId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.nome}
                      {!m.ativo && (
                        <Badge variant="outline" className="ml-2 font-normal">
                          inativo
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.perfilNome}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p>
                      {m.ultimoAcesso
                        ? (haQuanto(m.ultimoAcesso) ??
                          quandoFmt.format(new Date(m.ultimoAcesso)).replace(", ", " às "))
                        : "nunca entrou"}
                    </p>
                    <p>
                      {m.acoes30d > 0
                        ? `${m.acoes30d} ação${m.acoes30d === 1 ? "" : "es"} sensível${m.acoes30d === 1 ? "" : "eis"} em 30 dias`
                        : "sem ações sensíveis em 30 dias"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {atividade.data.eventos.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Ações recentes</p>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {atividade.data.eventos.slice(0, 10).map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2">
                      <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {quandoFmt.format(new Date(e.criadoEm)).replace(", ", " às ")}
                      </span>
                      <Badge variant="secondary" className="font-normal">
                        {ROTULO_ACAO[e.acao] ?? e.acao}
                      </Badge>
                      <span className="text-sm">{e.usuarioNome}</span>
                      {resumoDetalhe(e) && (
                        <span className="text-xs text-muted-foreground">{resumoDetalhe(e)}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {atividade.data.eventos.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando as 10 mais recentes de {atividade.data.eventos.length} carregadas — a
                    trilha completa vive em Financeiro → Auditoria.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
