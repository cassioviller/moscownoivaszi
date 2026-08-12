import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAjustes,
  getListAjustesQueryKey,
  type Ajuste,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { diasAteCasamento } from "../noivas/helpers";
import {
  casamentoDeReferencia,
  naSemana,
  prazoDias,
  rotuloCasamento,
  rotuloProva,
  urgenteAjuste,
} from "@/lib/ajustes-da-semana";
import { podeVirarPecaDoAcervo } from "@/lib/confeccao-no-acervo";
import { brl, diaMesAbrevAno } from "@/lib/formatos";
import { Badge } from "@/components/ui/badge";
import { podeNoModulo } from "@/lib/permissoes";
import { Erro } from "@/components/estado";
import { useAcoesDeAjuste } from "./acoes";
import { NovaConfeccao } from "./nova-confeccao";

/**
 * Ajustes — a fila da costureira (E14). O prazo que manda é a PRÓXIMA PROVA:
 * é para ela que a peça precisa estar pronta; o casamento é o fallback de quem
 * não tem prova marcada. O checklist por peça é interativo aqui mesmo — marcar
 * "barra feita" não pode exigir abrir a reserva. Recorte "esta semana" para a
 * pergunta de segunda de manhã: o que eu costuro até sexta?
 */

/** Prazo efetivo em dias: próxima prova, senão casamento; null = sem prazo. */
// E132: a régua do prazo saiu para `lib/ajustes-da-semana` — o cartão do
// painel conta o MESMO conjunto que esta fila mostra, por construção.

// S-A17: `rotuloProva`/`rotuloCasamento` moravam aqui e foram para
// `lib/ajustes-da-semana` — a ficha do trabalho diz o prazo com as mesmas palavras.

export default function Ajustes() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Semana é o recorte padrão — a fila responde "o que costuro agora", não
  // "tudo que existe". `?recorte=todos` abre o horizonte inteiro.
  /**
   * F24/E97 — o terceiro recorte. A fila só sabia mostrar PENDENTE: um ajuste
   * marcado como feito por engano sumia da tela e não havia caminho de volta,
   * enquanto `/atendimentos`, `/provas`, `/orcamentos` e `/receber` todas têm
   * a lente do estado oposto. O dado já vinha na MESMA query.
   */
  const recorteParam = searchParams.get("recorte");
  const recorte: "semana" | "todos" | "feitos" =
    recorteParam === "todos" ? "todos" : recorteParam === "feitos" ? "feitos" : "semana";

  const { data: ajustes, isLoading, isError, error, refetch } = useListAjustes(activeLojaId!, {
    query: {
      queryKey: getListAjustesQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });
  // S-A17: as ações (concluir/reabrir, marcar peça) são as mesmas da ficha do
  // trabalho — moram em `./acoes`, com a invalidação dupla que se esquece.
  const { mudarStatus, marcarPeca, mudandoStatus, marcandoPeca } = useAcoesDeAjuste();
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");
  // E156: o gesto abre o CADASTRO de vestido — quem não cadastra acervo não vê
  // um botão que a próxima tela recusaria.
  const podeCadastrarPeca = podeNoModulo(acessosModulos, "vestidos", "criar");
  // S-O28: abrir uma confecção é CRIAR na agenda — o mesmo módulo que
  // `POST /ajustes` cobra (`agenda.ts:248`), e a ação que o método deriva.
  const podeCriar = podeNoModulo(acessosModulos, "agenda", "criar");

  const { pendentes, foraDaSemana } = useMemo(() => {
    const alvo = recorte === "feitos" ? "FEITO" : "PENDENTE";
    const lista = (ajustes ?? []).filter((a): a is Ajuste => a.status === alvo);
    // Prazo mais apertado primeiro; sem prazo ao fim (não some — vira rabeira).
    lista.sort((a, b) => {
      const da = prazoDias(a);
      const db = prazoDias(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
    if (recorte === "todos" || recorte === "feitos") return { pendentes: lista, foraDaSemana: 0 };
    const semana = lista.filter(naSemana);
    return { pendentes: semana, foraDaSemana: lista.length - semana.length };
  }, [ajustes, recorte]);

  const trocarRecorte = (novo: "semana" | "todos" | "feitos") => {
    const proximo = new URLSearchParams(searchParams);
    if (novo === "semana") proximo.delete("recorte");
    else proximo.set("recorte", novo);
    setSearchParams(proximo, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif">Ajustes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A fila da costureira, do prazo mais apertado ao mais folgado — a próxima prova é o
            prazo; sem prova marcada, vale o casamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* S-O28: a confecção não tinha onde nascer — o único formulário de
              ajuste vivia dentro do bloco de provas de uma reserva, e confecção
              é justamente o trabalho SEM peça de acervo. */}
          <NovaConfeccao podeCriar={podeCriar} />
        <div className="flex gap-1 rounded-md border p-1">
          <Button
            variant={recorte === "semana" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => trocarRecorte("semana")}
          >
            Esta semana
          </Button>
          <Button
            variant={recorte === "todos" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => trocarRecorte("todos")}
          >
            Todos
          </Button>
          <Button
            variant={recorte === "feitos" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => trocarRecorte("feitos")}
          >
            Concluídos
          </Button>
        </div>
        </div>
      </div>

      {isError ? (
        <Erro titulo="Não deu para carregar os ajustes" erro={error} onTentarNovamente={() => refetch()} />
      ) : isLoading ? (
        <Card className="animate-pulse h-40" />
      ) : pendentes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {recorte === "semana" && foraDaSemana > 0 ? (
            <>
              <p>Nada com prazo nesta semana.</p>
              <p className="text-sm mt-1">
                {foraDaSemana} ajuste{foraDaSemana === 1 ? "" : "s"} pendente
                {foraDaSemana === 1 ? "" : "s"} mais adiante —{" "}
                <button className="underline" onClick={() => trocarRecorte("todos")}>
                  ver todos
                </button>
                .
              </p>
            </>
          ) : (
            <>
              <p>Nenhum ajuste pendente.</p>
              <p className="text-sm mt-1">
                Quando uma prova gerar um ajuste de costura, ele aparece aqui — com a noiva, o
                vestido e o prazo — até ser concluído.
              </p>
            </>
          )}
        </div>
      ) : (
        <Card>
          <ul className="divide-y">
            {pendentes.map((a) => {
              const bloqueio = a.atendimento?.bloqueio;
              const diasProva = a.proximaProva ? diasAteCasamento(a.proximaProva) : null;
              const casamento = casamentoDeReferencia(a);
              const diasCasamento = casamento ? diasAteCasamento(casamento) : null;
              /**
               * S-O27 — a cor vem de `urgenteAjuste`, um lugar só.
               *
               * Aqui a conta era inline e lia o casamento **só do bloqueio** —
               * e confecção não tem bloqueio, por definição. Medido: a
               * confecção com casamento em 5 dias entrava no recorte "esta
               * semana" e saía CINZA nesta lista, enquanto a ficha do mesmo
               * trabalho a pintava de vermelho.
               */
              const urgente = urgenteAjuste(a);
              const checklist = a.checklist ?? [];
              const feitos = checklist.filter((c) => c.feito).length;
              return (
                <li key={a.id} className="flex items-start gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      {/* E155: as duas naturezas dividem a fila, e é por isso
                          que o rótulo precisa existir — a costureira precisa
                          saber se corta ou se conserta antes de pegar a peça.
                          O AJUSTE é o caso comum e segue sem selo. */}
                      {a.tipo === "CONFECCAO" && (
                        <Badge variant="secondary" className="text-xs">Confecção</Badge>
                      )}
                      {/* S-A17: a descrição leva à ficha DESTE trabalho — numa
                          fila longa, achar de novo era busca a olho. */}
                      <Link to={`/loja/${lojaId}/ajustes/${a.id}`} className="hover:underline">
                        {a.descricao}
                      </Link>
                      {a.custo != null && (
                        <span className="text-xs text-muted-foreground">custo {brl(a.custo)}</span>
                      )}
                      {/* E156: uma vez no acervo, a linha mostra a PEÇA e não o
                          gesto — é o que impede a mesma confecção de virar duas
                          peças, cada uma com um código. */}
                      {a.pecaDoAcervo && (
                        <Link
                          to={`/loja/${lojaId}/vestidos/${a.pecaDoAcervo.id}`}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          no acervo · {a.pecaDoAcervo.codigo}
                        </Link>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {a.atendimento?.leadId ? (
                        <Link
                          to={`/loja/${lojaId}/noivas/${a.atendimento.leadId}`}
                          className="hover:underline"
                        >
                          {a.atendimento.lead?.noivaNome ?? "Noiva"}
                        </Link>
                      ) : (
                        <span>{a.atendimento?.lead?.noivaNome ?? "Noiva"}</span>
                      )}
                      {bloqueio?.vestido && (
                        <>
                          <span>·</span>
                          <span>
                            {bloqueio.vestido.codigo} · {bloqueio.vestido.nome}
                          </span>
                        </>
                      )}
                      {diasProva !== null ? (
                        <>
                          <span>·</span>
                          <span className={urgente ? "text-destructive font-medium" : undefined}>
                            {rotuloProva(diasProva)}
                          </span>
                          <span>·</span>
                          <span>{diaMesAbrevAno(a.proximaProva!)}</span>
                        </>
                      ) : diasCasamento !== null ? (
                        <>
                          <span>·</span>
                          <span className={urgente ? "text-destructive font-medium" : undefined}>
                            {rotuloCasamento(diasCasamento)}
                          </span>
                          <span>·</span>
                          <span>{diaMesAbrevAno(casamento!)}</span>
                        </>
                      ) : (
                        <>
                          <span>·</span>
                          <span>sem prazo definido</span>
                        </>
                      )}
                    </span>
                    {/* Checklist por peça, interativo na própria fila (E14). */}
                    {checklist.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {checklist.map((item) => (
                          <li key={item.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              id={`peca-${item.id}`}
                              checked={item.feito}
                              disabled={!podeEditar || marcandoPeca}
                              onCheckedChange={(v) => marcarPeca(item.id, v === true)}
                              aria-label={item.descricao}
                            />
                            <label
                              htmlFor={`peca-${item.id}`}
                              className={
                                item.feito ? "text-muted-foreground line-through" : undefined
                              }
                            >
                              {item.descricao}
                            </label>
                          </li>
                        ))}
                        <li className="text-xs text-muted-foreground">
                          {feitos}/{checklist.length} peça{checklist.length === 1 ? "" : "s"}
                        </li>
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* E156 — a confecção vira peça do acervo (P4), e é GESTO:
                        nada vira sozinho quando o casamento passa. Quem decide
                        se aquela manga entra no acervo é quem vai alugá-la de
                        novo — mesma doutrina do E100/F37 e do E151. */}
                    {podeCadastrarPeca && podeVirarPecaDoAcervo(a) && (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/loja/${lojaId}/vestidos/novo?confeccao=${a.id}`}>
                          Virou peça do acervo
                        </Link>
                      </Button>
                    )}
                    {a.atendimento?.bloqueioId && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/loja/${lojaId}/reservas/${a.atendimento.bloqueioId}`}>
                          Abrir
                        </Link>
                      </Button>
                    )}
                    {podeEditar && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={mudandoStatus}
                        onClick={() => mudarStatus(a.id, recorte === "feitos" ? "PENDENTE" : "FEITO")}
                      >
                        {recorte === "feitos" ? "Reabrir" : "Marcar feito"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
