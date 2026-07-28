import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { podeNoModulo } from "@/lib/permissoes";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useRegistrarContatoAtendimento,
  useDesfazerContatoAtendimento,
  useListCabines,
  getListCabinesQueryKey,
  useListAjustes,
  getListAjustesQueryKey,
  useGetDisponibilidade,
  getGetDisponibilidadeQueryKey,
} from "@workspace/api-client-react";
import { GradeDoDia } from "./grade";
import { EXPEDIENTE_PADRAO } from "@/lib/agenda";
import { diaLocal } from "@/lib/financeiro/datas";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, AlertCircle, MessageCircle } from "lucide-react";
import { linkWhatsApp, msgConfirmacaoAtendimento } from "@/lib/whatsapp";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { instanteHora } from "@/lib/formatos";

const SITUACAO_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

export default function Agenda() {
  const { activeLojaId, acessosModulos, session } = useAuth();
  const podeCriar = podeNoModulo(acessosModulos, "agenda", "criar");
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");

  // O dia da grade vive na URL (?dia=YYYY-MM-DD), como a semana do E20 — sem
  // isso não há deep-link para "a agenda de amanhã" nem teste determinístico.
  const diaYMD = searchParams.get("dia") ?? diaLocal(new Date());

  // E83: a grade pede o DIA visível, não a agenda inteira.
  const janelaDia = { de: diaYMD, ate: diaYMD };
  const atendimentos = useListAtendimentos(activeLojaId!, janelaDia, {
    query: { queryKey: getListAtendimentosQueryKey(activeLojaId!, janelaDia), enabled: !!activeLojaId },
  });
  const cabines = useListCabines(activeLojaId!, { query: { ...CACHE_ESTAVEL, queryKey: getListCabinesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  const ajustes = useListAjustes(activeLojaId!, { query: { queryKey: getListAjustesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  // E39: confirmar presença carimba confirmadoEm; a fila para de repetir quem já
  // foi contatado. Invalida a agenda para o card mudar de "falta" para "feito".
  const registrarContato = useRegistrarContatoAtendimento({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
    },
  });

  // E63: o nome vem do próprio atendimento (o GET embute a noiva) — a agenda
  // parou de baixar a lista completa de leads só para rotular os cards.
  const nomePorLead = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const a of atendimentos.data ?? []) {
      if (a.lead?.noivaNome) mapa.set(a.leadId, a.lead.noivaNome);
    }
    return mapa;
  }, [atendimentos.data]);

  // E8: confirmação por wa.me — a mensagem carrega nome e endereço da loja,
  // que já vêm na sessão (/auth/me); nada de request extra.
  const lojaAtiva = session?.lojas?.find((l) => l.id === activeLojaId);
  const waConfirmacao = (a: {
    lead?: { noivaNome?: string; whatsapp?: string | null } | null;
    tipo: string;
    inicio: string;
  }) =>
    linkWhatsApp(
      a.lead?.whatsapp,
      msgConfirmacaoAtendimento({
        noivaNome: a.lead?.noivaNome,
        tipo: a.tipo,
        inicio: a.inicio,
        lojaNome: lojaAtiva?.nome,
        endereco: lojaAtiva?.endereco,
      }),
    );

  // O expediente configurado desenha as linhas da grade; loja sem regra usa o
  // mesmo default das colunas do schema.
  const disponibilidade = useGetDisponibilidade(activeLojaId!, {
    query: { queryKey: getGetDisponibilidadeQueryKey(activeLojaId!), enabled: !!activeLojaId, retry: false },
  });
  const expediente = disponibilidade.data
    ? {
        aberturaHora: disponibilidade.data.atendimentoAberturaHora,
        fechamentoHora: disponibilidade.data.atendimentoFechamentoHora,
        // E38: a grade também recusa o drop num dia fechado (LOJA_FECHADA).
        dias: disponibilidade.data.diasFuncionamento,
      }
    : EXPEDIENTE_PADRAO;

  // Atendimentos do dia escolhido, comparados no fuso da loja — `isSameDay` do
  // date-fns lê o fuso do navegador, que não é necessariamente o da loja.
  const doDia = useMemo(
    () =>
      (atendimentos.data ?? [])
        .filter((a) => diaLocal(a.inicio) === diaYMD)
        .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
    [atendimentos.data, diaYMD],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Agenda</h1>
        <div className="flex items-center gap-2">
          {activeLojaId && (
            <>
              {/* Visão semanal (E20): a grade semana × cabine. */}
              <Button asChild variant="ghost">
                <Link to={`/loja/${activeLojaId}/agenda/semana`}>Semana</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to={`/loja/${activeLojaId}/atendimentos`}>Fila de atendimentos</Link>
              </Button>
            </>
          )}
          {/* F12: agendar tem uma porta só, e é a de /atendimentos/novo. O
              diálogo que morava aqui criava o atendimento com o instante do
              NAVEGADOR (`new Date(inicio)`) em vez do fuso da loja, punha a
              vendedora logada como responsável sem perguntar, e aceitava
              tipo=PROVA sem reserva — a prova órfã que o E97 teve de consertar
              depois. O `?dia=` leva o dia que está na grade. */}
          {podeCriar && activeLojaId && (
            <Button asChild>
              <Link to={`/loja/${activeLojaId}/atendimentos/novo?dia=${diaYMD}`}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Agendamento
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Atendimentos do dia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {atendimentos.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao carregar os atendimentos</AlertTitle>
                <AlertDescription className="flex items-center gap-3">
                  <span>Falha ao buscar a agenda.</span>
                  <Button variant="outline" size="sm" onClick={() => atendimentos.refetch()}>
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : atendimentos.isLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-md" />)}
              </div>
            ) : (
              <>
                <GradeDoDia
                  activeLojaId={activeLojaId!}
                  diaYMD={diaYMD}
                  atendimentos={doDia}
                  cabines={cabines.data ?? []}
                  expediente={expediente}
                  podeEditar={podeEditar}
                  nomePorLead={nomePorLead}
                />

                {/* A confirmação por wa.me (E8) saiu do card, que na grade tem
                    largura de coluna: vira uma fila abaixo, só de quem ainda
                    está AGENDADO — que é justamente quem precisa confirmar. */}
                {doDia.some((a) => a.situacao === "AGENDADO") && (() => {
                  const agendados = doDia.filter((a) => a.situacao === "AGENDADO");
                  // E97/F6: a fila é de quem a loja ainda NÃO procurou. Antes
                  // ela filtrava por `confirmadoEm`, que também era escrito pelo
                  // clique daqui — então a linha sumia sem ninguém ter falado
                  // com a noiva, e ficava indistinguível de quem confirmou pelo
                  // portal. Quem já respondeu de verdade sai da fila também,
                  // porque não há o que perguntar a ela.
                  const faltaContatar = agendados.filter((a) => !a.contatadoEm && !a.confirmadoEm);
                  const jaConfirmados = agendados.filter((a) => a.confirmadoEm).length;
                  const soContatados = agendados.filter((a) => a.contatadoEm && !a.confirmadoEm).length;
                  return (
                    <div className="space-y-2 border-t pt-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Falta procurar
                      </p>
                      {faltaContatar.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Todas as noivas do dia já foram procuradas.</p>
                      ) : (
                        faltaContatar.map((atendimento) => {
                          const wa = waConfirmacao(atendimento);
                          return (
                            <div key={atendimento.id} className="flex items-center justify-between gap-3 text-sm" data-testid={`confirmar-linha-${atendimento.id}`}>
                              <span className="min-w-0 truncate">
                                <span className="tabular-nums text-muted-foreground">
                                  {instanteHora(atendimento.inicio)}
                                </span>{" "}
                                {nomePorLead.get(atendimento.leadId) ?? "Noiva"}
                              </span>
                              {wa && (
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  data-testid={`confirmar-btn-${atendimento.id}`}
                                >
                                  {/* Abrir o wa.me (o <a> navega) E carimbar que
                                      a LOJA procurou — não que a noiva
                                      respondeu. O rótulo passou a dizer isso. */}
                                  <a
                                    href={wa}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() =>
                                      registrarContato.mutate({ lojaId: activeLojaId!, atendimentoId: atendimento.id })
                                    }
                                  >
                                    <MessageCircle className="h-4 w-4 mr-1" />
                                    Chamar no WhatsApp
                                  </a>
                                </Button>
                              )}
                            </div>
                          );
                        })
                      )}
                      {/* Os dois números são fatos diferentes e passam a ser
                          ditos como tais: uma fila que some não conta quem
                          respondeu. */}
                      {jaConfirmados > 0 && (
                        <p className="text-positivo pt-1 text-xs font-medium">
                          {jaConfirmados} confirmou pelo portal.
                        </p>
                      )}
                      {soContatados > 0 && (
                        <p className="text-muted-foreground pt-1 text-xs">
                          {soContatados} procurada{soContatados === 1 ? "" : "s"}, ainda sem resposta.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cabines</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {cabines.data?.map(cabine => (
                  <li key={cabine.id} className="flex items-center justify-between text-sm">
                    <span>{cabine.nome}</span>
                    <Badge variant={cabine.ativo ? "default" : "secondary"}>{cabine.ativo ? 'Ativa' : 'Inativa'}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ajustes pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              {(ajustes.data ?? []).filter(a => a.status === 'PENDENTE').length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">Nenhum ajuste pendente.</p>
              ) : (
                <ul className="space-y-3">
                  {ajustes.data?.filter(a => a.status === 'PENDENTE').map(ajuste => (
                    <li key={ajuste.id} className="text-sm border-b pb-2 last:border-0">
                      {ajuste.descricao}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
