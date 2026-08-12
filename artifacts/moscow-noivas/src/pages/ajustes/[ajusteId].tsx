import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useListAjustes, getListAjustesQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CabecalhoDetalhe } from "@/components/cabecalho-detalhe";
import { NaoEncontrado, Erro } from "@/components/estado";
import { diasAteCasamento } from "../noivas/helpers";
import {
  casamentoDeReferencia,
  rotuloCasamento,
  rotuloProva,
  urgenteAjuste,
} from "@/lib/ajustes-prazo";
import { podeVirarPecaDoAcervo } from "@/lib/confeccao-no-acervo";
import { brl, diaMesAbrevAno } from "@/lib/formatos";
import { podeNoModulo } from "@/lib/permissoes";
import { useAcoesDeAjuste } from "./acoes";

/**
 * S-A17 — a ficha de UM trabalho da costureira.
 *
 * O E155 pôs ajuste e confecção na mesma fila e o item do orçamento passou a
 * apontar o trabalho — mas o link levava à FILA (`/ajustes?recorte=todos`), e
 * numa fila longa "na fila da costureira" obrigava a procurar a olho. Enquanto
 * a confecção era inexistente isso não pesava; agora que ela tem custo e é
 * cobrada, pesa.
 *
 * A API não tem `GET /ajustes/:id` (de propósito: a fila carrega tudo de uma
 * vez), então a ficha pede a MESMA lista da fila — mesma query key, mesmo
 * cache: vindo da fila não há segunda ida ao servidor, e o deep link funciona
 * porque a lista se busca sozinha.
 */
export default function AjusteDetalhe() {
  const { lojaId, ajusteId } = useParams();
  const { activeLojaId, acessosModulos } = useAuth();

  const { data: ajustes, isLoading, isError, error, refetch } = useListAjustes(activeLojaId!, {
    query: {
      queryKey: getListAjustesQueryKey(activeLojaId!),
      enabled: !!activeLojaId,
    },
  });
  const { mudarStatus, marcarPeca, mudandoStatus, marcandoPeca } = useAcoesDeAjuste();
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");
  // E156: o gesto abre o CADASTRO de vestido — quem não cadastra acervo não vê
  // uma ação que a próxima tela recusaria.
  const podeCadastrarPeca = podeNoModulo(acessosModulos, "vestidos", "criar");

  if (isError) {
    return <Erro titulo="Não deu para carregar o trabalho" erro={error} onTentarNovamente={() => refetch()} />;
  }
  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;

  const a = (ajustes ?? []).find((x) => x.id === ajusteId);
  if (!a) {
    return (
      <NaoEncontrado
        titulo="Este trabalho não existe"
        voltarPara={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/loja/${lojaId}/ajustes`}>Voltar à fila da costureira</Link>
          </Button>
        }
      />
    );
  }

  const feito = a.status === "FEITO";
  const confeccao = a.tipo === "CONFECCAO";
  const noivaNome = a.atendimento?.lead?.noivaNome;
  const bloqueio = a.atendimento?.bloqueio;
  // E170/A05.5 — a MESMA referência da fila: o casamento da noiva quando não há
  // bloqueio. A ficha calculava só `bloqueio?.casamentoData` e dizia "Sem prazo
  // definido" para toda confecção, enquanto a fila já a ordena pelo prazo.
  const casamento = casamentoDeReferencia(a);
  const diasProva = a.proximaProva ? diasAteCasamento(a.proximaProva) : null;
  const diasCasamento = casamento ? diasAteCasamento(casamento) : null;
  /**
   * S-O27 — agora é MESMO a régua da fila, e não só na frase.
   *
   * Este comentário dizia *"a mesma régua de urgência da fila"* sobre uma conta
   * escrita à mão aqui, uma segunda escrita à mão na fila, e uma terceira —
   * `prazoApertado` — que decide o RECORTE. As três discordavam, e a pior
   * discordância era com a própria fila: a confecção com casamento em 5 dias
   * entrava no recorte "esta semana" e saía cinza lá, vermelha aqui.
   */
  const urgente = urgenteAjuste(a);
  const checklist = a.checklist ?? [];
  const feitos = checklist.filter((c) => c.feito).length;

  return (
    <div className="space-y-6">
      <CabecalhoDetalhe
        trilha={[
          { rotulo: "Ajustes", para: "/ajustes" },
          ...(a.atendimento?.leadId
            ? [{ rotulo: noivaNome ?? "Noiva", para: `/noivas/${a.atendimento.leadId}` }]
            : []),
          { rotulo: confeccao ? "Confecção" : "Ajuste" },
        ]}
        titulo={a.descricao}
        chip={
          <Badge variant={feito ? "default" : "secondary"} className="text-sm px-3 py-1">
            {feito ? "Concluído" : "Pendente"}
          </Badge>
        }
        subtitulo={
          <>
            {confeccao ? "Peça nova, feita para a noiva" : "Peça existente que se altera"}
            {bloqueio?.vestido && <> • {bloqueio.vestido.codigo} · {bloqueio.vestido.nome}</>}
            {noivaNome && <> • {noivaNome}</>}
          </>
        }
        acaoPrimaria={
          podeEditar ? (
            <Button
              variant="outline"
              size="sm"
              disabled={mudandoStatus}
              onClick={() => mudarStatus(a.id, feito ? "PENDENTE" : "FEITO")}
            >
              {feito ? "Reabrir" : "Marcar feito"}
            </Button>
          ) : undefined
        }
        acoes={[
          // E156 — a confecção CONCLUÍDA vira peça do acervo, por gesto.
          ...(podeCadastrarPeca && podeVirarPecaDoAcervo(a)
            ? [{ rotulo: "Virou peça do acervo", para: `/vestidos/novo?confeccao=${a.id}` }]
            : []),
          ...(a.atendimento?.bloqueioId
            ? [{ rotulo: "Abrir a reserva", para: `/reservas/${a.atendimento.bloqueioId}` }]
            : []),
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>O trabalho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-muted-foreground text-sm">Tipo</span>
              <p className="font-medium">{confeccao ? "Confecção" : "Ajuste"}</p>
            </div>
            {/* E155: confecção tem custo — é o que o item do orçamento cobra. */}
            {a.custo != null && (
              <div>
                <span className="text-muted-foreground text-sm">Custo</span>
                <p className="font-medium">{brl(a.custo)}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground text-sm">Prazo</span>
              {diasProva !== null ? (
                <p className={`font-medium ${urgente ? "text-destructive" : ""}`}>
                  {rotuloProva(diasProva)} · {diaMesAbrevAno(a.proximaProva!)}
                </p>
              ) : diasCasamento !== null ? (
                <p className={`font-medium ${urgente ? "text-destructive" : ""}`}>
                  {rotuloCasamento(diasCasamento)} · {diaMesAbrevAno(casamento!)}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">Sem prazo definido — sem prova nem casamento marcado.</p>
              )}
            </div>
            {/* E156: uma vez no acervo, a ficha mostra a PEÇA — a mesma
                confecção não vira duas. */}
            {a.pecaDoAcervo && (
              <div>
                <span className="text-muted-foreground text-sm">No acervo</span>
                <p className="font-medium">
                  <Link
                    to={`/loja/${lojaId}/vestidos/${a.pecaDoAcervo.id}`}
                    className="hover:underline"
                  >
                    {a.pecaDoAcervo.codigo} · {a.pecaDoAcervo.nome}
                  </Link>
                </p>
              </div>
            )}
            {checklist.length > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">
                  Peças ({feitos}/{checklist.length})
                </span>
                {/* O mesmo checklist interativo da fila (E14). */}
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
                        className={item.feito ? "text-muted-foreground line-through" : undefined}
                      >
                        {item.descricao}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>De onde veio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-muted-foreground text-sm">Noiva</span>
              <p className="font-medium">
                {a.atendimento?.leadId ? (
                  <Link to={`/loja/${lojaId}/noivas/${a.atendimento.leadId}`} className="hover:underline">
                    {noivaNome ?? "Noiva"}
                  </Link>
                ) : (
                  noivaNome ?? "—"
                )}
              </p>
            </div>
            {bloqueio?.vestido && (
              <div>
                <span className="text-muted-foreground text-sm">Vestido</span>
                <p className="font-medium">
                  <Link to={`/loja/${lojaId}/vestidos/${bloqueio.vestidoId}`} className="hover:underline">
                    {bloqueio.vestido.codigo} · {bloqueio.vestido.nome}
                  </Link>
                </p>
              </div>
            )}
            {casamento && (
              <div>
                <span className="text-muted-foreground text-sm">Casamento</span>
                <p className="font-medium">{diaMesAbrevAno(casamento)}</p>
              </div>
            )}
            {a.atendimento && (
              <div>
                <span className="text-muted-foreground text-sm">Nasceu em</span>
                <p className="font-medium">
                  {a.atendimento.tipo === "PROVA" ? "Prova" : "Atendimento"} de{" "}
                  {diaMesAbrevAno(a.atendimento.inicio)}
                </p>
              </div>
            )}
            {a.atendimento?.bloqueioId && (
              <p className="text-muted-foreground text-sm">
                As provas e a movimentação do vestido estão na{" "}
                <Link
                  to={`/loja/${lojaId}/reservas/${a.atendimento.bloqueioId}`}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  ficha da reserva
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
