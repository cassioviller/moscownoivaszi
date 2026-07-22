import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListBloqueios,
  getListBloqueiosQueryKey,
  type BloqueioVestido,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { etapaLabel } from "@/lib/formatos";
import { diasAteCasamento, casamentoUrgente } from "../noivas/helpers";
import { agruparPorMes, mesAbrevFmt, mesAnoFmt } from "./helpers";

/**
 * Livro de reservas (porte da /reservas do feat/orcamentos) — quem casa com
 * qual vestido. Lente "compromisso" (uma linha por noiva), distinta da Agenda:
 * aqui a noiva é a protagonista e a etapa do funil diz como vai cada
 * compromisso. Sem endpoint dedicado: GET /bloqueios com `futuras=` (E87)
 * devolve só a lente aberta; no cliente sobra o filtro semântico
 * (tipo RESERVA_CASAMENTO, não cancelados), agrupado por mês do casamento.
 */
export default function Reservas() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const [passadas, setPassadas] = useState(false);

  // E87: o corte futuro/passado roda no servidor — `futuras=` recorta por
  // casamentoData contra hoje (dia local) e já devolve na ordem da lente
  // (próximas asc, passadas desc). Queries separadas, cache por chave;
  // keepPreviousData segura a lista anterior no toggle para não piscar.
  const paramsReservas = { futuras: passadas ? ("false" as const) : ("true" as const) };
  const { data: bloqueios, isLoading, isError, error, refetch } = useListBloqueios(activeLojaId!, paramsReservas, {
    query: {
      queryKey: getListBloqueiosQueryKey(activeLojaId!, paramsReservas),
      enabled: !!activeLojaId,
      placeholderData: keepPreviousData,
    },
  });

  const reservas = useMemo(
    // O que sobra no cliente é semântica, não volume: só reserva de casamento
    // viva (manutenção não tem casamentoData e o servidor já a descartou).
    () =>
      (bloqueios ?? []).filter(
        (b): b is BloqueioVestido =>
          b.tipo === "RESERVA_CASAMENTO" && !b.canceladoEm && !!b.casamentoData,
      ),
    [bloqueios],
  );

  const meses = useMemo(
    () => agruparPorMes(reservas, (r) => new Date(r.casamentoData!), mesAnoFmt, true),
    [reservas],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">{passadas ? "Reservas passadas" : "Reservas"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {passadas
              ? "Casamentos já realizados."
              : "Quem casa com qual vestido, nos próximos casamentos."}
          </p>
        </div>
        <Button variant="outline" onClick={() => setPassadas((v) => !v)}>
          {passadas ? "Voltar às próximas reservas" : "Ver reservas passadas"}
        </Button>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar as reservas</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>{error instanceof Error ? error.message : "Falha inesperada."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse h-28" />
          ))}
        </div>
      ) : reservas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{passadas ? "Nenhuma reserva passada." : "Nenhuma reserva por aqui ainda."}</p>
          {!passadas && (
            <p className="text-sm mt-1">
              Quando um vestido for reservado para o casamento de uma noiva, ele aparece aqui, da
              data mais próxima à mais distante.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {meses.map((mes) => (
            <section key={mes.chave} className="space-y-3">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground first-letter:uppercase">
                {mes.rotulo}
              </h2>
              <Card>
                <ul className="divide-y">
                  {mes.itens.map((r) => {
                    const casamento = new Date(r.casamentoData!);
                    const dias = diasAteCasamento(r.casamentoData!);
                    // Destaque só na urgência: casamento próximo (≤14d).
                    const urgente = !passadas && casamentoUrgente(dias);
                    return (
                      <li key={r.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex w-11 shrink-0 flex-col items-center">
                          <span
                            className={`font-serif text-xl leading-none tabular-nums ${
                              urgente ? "text-destructive" : ""
                            }`}
                          >
                            {casamento.getUTCDate()}
                          </span>
                          <span className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {mesAbrevFmt.format(casamento).replace(".", "")}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          {/* Noiva = destino primário (a reserva é dela; o perfil mostra a jornada) */}
                          {r.leadId ? (
                            <Link
                              to={`/loja/${lojaId}/noivas/${r.leadId}`}
                              className="w-fit text-sm font-medium hover:underline"
                            >
                              {r.lead?.noivaNome ?? "Noiva"}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium">{r.lead?.noivaNome ?? "Noiva"}</span>
                          )}
                          {/* Etapa do funil (o que a Agenda não mostra) + vestido como chip */}
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {r.lead && (
                              <span className="text-xs text-muted-foreground">
                                {etapaLabel(r.lead.etapa)}
                              </span>
                            )}
                            {r.vestido && (
                              <Link to={`/loja/${lojaId}/vestidos/${r.vestidoId}`}>
                                <Badge variant="secondary" className="hover:bg-secondary/80">
                                  {r.vestido.codigo} · {r.vestido.nome}
                                </Badge>
                              </Link>
                            )}
                            <Link
                              to={`/loja/${lojaId}/reservas/${r.id}`}
                              className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                            >
                              Provas &amp; ajustes
                            </Link>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
