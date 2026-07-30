import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
} from "@workspace/api-client-react";
import { hojeLocal, addDias, diaLocal } from "@/lib/financeiro/datas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { diaMesAbrevAno } from "@/lib/formatos";
import {
  ROTULO_SITUACAO,
  agruparPorMes,
  diasAteLocal,
  mesAbrevLocalFmt,
  mesAnoLocalFmt,
} from "../reservas/helpers";
import { Erro } from "@/components/estado";

/** Prova a ≤7 dias pede atenção (mesmo limiar do orcamentos). */
const JANELA_IMINENTE_DIAS = 7;

/**
 * Agenda de provas do atelier (porte da /provas do feat/orcamentos) — todas as
 * provas da loja (Atendimento{tipo:PROVA}) agrupadas por mês, com deep-link para
 * a reserva. O agendamento vive na Agenda e o ciclo (ajustes/checklist) no
 * detalhe da reserva — não aqui, de propósito. Sem endpoint de provas: a lista
 * de atendimentos com tipo=PROVA e a janela de/ate (E83/E87) já é o recorte.
 */
export default function Provas() {
  const { lojaId } = useParams();
  const { activeLojaId } = useAuth();
  const [passadas, setPassadas] = useState(false);

  // E79: a tela pede só as PROVAS — o recorte por tipo roda no banco.
  // E87: o corte futuro/passado também — a janela de/ate do E83 recorta no
  // servidor (futuras = de hoje, passadas = até ontem), em queries separadas
  // com cache por chave; keepPreviousData segura a lista anterior no toggle.
  const paramsProvas = passadas
    ? { tipo: "PROVA" as const, ate: addDias(hojeLocal(), -1) }
    : { tipo: "PROVA" as const, de: hojeLocal() };
  const { data: atendimentos, isLoading, isError, error, refetch } = useListAtendimentos(
    activeLojaId!,
    paramsProvas,
    {
      query: {
        queryKey: getListAtendimentosQueryKey(activeLojaId!, paramsProvas),
        enabled: !!activeLojaId,
        placeholderData: keepPreviousData,
      },
    },
  );

  const provas = useMemo(() => {
    // O servidor já devolve só o recorte pedido; aqui sobra a ordem da lente:
    // próximas da mais próxima à mais distante; passadas da mais recente à mais antiga.
    const lista = [...(atendimentos ?? [])];
    lista.sort((a, b) =>
      passadas
        ? new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
        : new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
    );
    return lista;
  }, [atendimentos, passadas]);

  const meses = useMemo(
    () => agruparPorMes(provas, (p) => new Date(p.inicio), mesAnoLocalFmt, false),
    [provas],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">{passadas ? "Provas anteriores" : "Provas"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {passadas
              ? "As provas já realizadas."
              : "As próximas provas do atelier, da mais próxima à mais distante."}
          </p>
        </div>
        <Button variant="outline" onClick={() => setPassadas((v) => !v)}>
          {passadas ? "Voltar às próximas provas" : "Ver provas anteriores"}
        </Button>
      </div>

      {isError ? (
        <Erro titulo="Não deu para carregar as provas" erro={error} onTentarNovamente={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse h-28" />
          ))}
        </div>
      ) : provas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{passadas ? "Nenhuma prova anterior." : "Nenhuma prova por aqui ainda."}</p>
          {!passadas && (
            <p className="text-sm mt-1">
              Quando uma prova for registrada na reserva de uma noiva, ela aparece aqui — para o
              atelier acompanhar quem vem provar e quando.
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
                  {mes.itens.map((p) => {
                    const inicio = new Date(p.inicio);
                    const dias = diasAteLocal(p.inicio);
                    // Destaque só na iminência: prova nos próximos 7 dias.
                    const iminente = !passadas && dias >= 0 && dias <= JANELA_IMINENTE_DIAS;
                    const vestido = p.bloqueio?.vestido;
                    return (
                      <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex w-11 shrink-0 flex-col items-center">
                          <span
                            className={`font-serif text-xl leading-none tabular-nums ${
                              iminente ? "text-destructive" : ""
                            }`}
                          >
                            {/* E115: o dia saía do relógio do NAVEGADOR e o
                                mês (linha de baixo) do da LOJA — a prova de
                                31/07 às 23h aparecia como "1 JUL". */}
                            {Number(diaLocal(inicio).slice(8, 10))}
                          </span>
                          <span className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {mesAbrevLocalFmt.format(inicio).replace(".", "")}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            {/* Noiva = destino primário; o perfil mostra a jornada */}
                            <Link
                              to={`/loja/${lojaId}/noivas/${p.leadId}`}
                              className="text-sm font-medium hover:underline"
                            >
                              {p.lead?.noivaNome ?? "Noiva"}
                            </Link>
                            <span className="text-xs text-muted-foreground">Prova</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Badge variant="secondary">
                              {ROTULO_SITUACAO[p.situacao] ?? p.situacao}
                            </Badge>
                            {vestido && (
                              <span className="text-xs text-muted-foreground">
                                {vestido.codigo} · {vestido.nome}
                              </span>
                            )}
                            {p.bloqueio?.casamentoData && (
                              <span className="text-xs text-muted-foreground">
                                casamento {diaMesAbrevAno(p.bloqueio.casamentoData)}
                              </span>
                            )}
                            {p.bloqueioId && (
                              <Link
                                to={`/loja/${lojaId}/reservas/${p.bloqueioId}`}
                                className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                              >
                                Abrir reserva
                              </Link>
                            )}
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
