import { varianteAtivo } from "@/lib/status-badge";
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
  useListAusencias,
  getListAusenciasQueryKey,
  getListAjustesQueryKey,
  useGetDisponibilidade,
  getGetDisponibilidadeQueryKey,
} from "@workspace/api-client-react";
import { GradeDoDia } from "./grade";
import { FilaFaltaProcurar } from "./fila-contato";
import { expedienteDaRegra } from "@/lib/agenda";
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
import { useToast } from "@/hooks/use-toast";
import { mensagemApi } from "@/lib/erro-api";

const SITUACAO_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

export default function Agenda() {
  const { activeLojaId, acessosModulos, session } = useAuth();
  const podeCriar = podeNoModulo(acessosModulos, "agenda", "criar");
  const { toast } = useToast();
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
  // E151: quem falta HOJE (ou no dia visível). O recorte `?desde=` corta as
  // férias que já passaram — a grade só precisa do que ainda impede.
  const paramsAusencias = { desde: diaYMD };
  const ausencias = useListAusencias(activeLojaId!, paramsAusencias, {
    query: { queryKey: getListAusenciasQueryKey(activeLojaId!, paramsAusencias), enabled: !!activeLojaId },
  });
  const ajustes = useListAjustes(activeLojaId!, { query: { queryKey: getListAjustesQueryKey(activeLojaId!), enabled: !!activeLojaId } });
  // E39: confirmar presença carimba confirmadoEm; a fila para de repetir quem já
  // foi contatado. Invalida a agenda para o card mudar de "falta" para "feito".
  const registrarContato = useRegistrarContatoAtendimento({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) }),
      /**
       * G13 (E168) — o carimbo falhava CALADO.
       *
       * O clique abre o wa.me numa aba nova e dispara o POST na atual: se ele
       * volta 403 (ou cai a rede), a noiva foi procurada de verdade e o
       * sistema não sabe. A linha fica na fila, e a próxima pessoa procura de
       * novo — a noiva recebe a mesma mensagem duas vezes.
       */
      onError: (err) =>
        toast({
          title: "O WhatsApp abriu, mas o contato não foi registrado",
          description: mensagemApi(err, "Tente registrar de novo pela fila do dia.", {
            ACESSO_NEGADO_MODULO:
              "Você não tem permissão para registrar contato na agenda — avise quem edita, senão a noiva será procurada de novo.",
          }),
          variant: "destructive",
        }),
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
  /**
   * G8 (E168) — esta montagem era a QUARTA cópia da mesma tradução, e a que
   * esquecia `provaDuracao`: toda prova virava 1 slot, a célula das 14:30
   * ficava acesa, aceitava o card, e o servidor devolvia 422 sobre um destino
   * que esta tela tinha pintado como livre. **Só a loja CONFIGURADA errava** —
   * a sem regra caía no `EXPEDIENTE_PADRAO`, que traz `provaDuracao: 2`.
   */
  const expediente = expedienteDaRegra(disponibilidade.data);

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
        <div>
          <h1 className="text-3xl font-serif">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">O dia da loja, cabine a cabine.</p>
        </div>
        <div className="flex items-center gap-2">
          {activeLojaId && (
            <>
              {/* E130/A3: ir a OUTRA tela do domínio é o link-seta (a língua
                  do Financeiro) — os botões ghost eram uma terceira cara para
                  o mesmo gesto. Visão semanal (E20): a grade semana × cabine. */}
              <Link
                to={`/loja/${activeLojaId}/agenda/semana`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Semana →
              </Link>
              <Link
                to={`/loja/${activeLojaId}/atendimentos`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Fila de atendimentos →
              </Link>
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
                Novo agendamento
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
                <AlertTitle>Não deu para carregar os atendimentos</AlertTitle>
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
                  ausencias={ausencias.data ?? []}
                  podeEditar={podeEditar}
                  nomePorLead={nomePorLead}
                />

                {/* A confirmação por wa.me (E8) saiu do card, que na grade tem
                    largura de coluna: vira uma fila abaixo, só de quem ainda
                    está AGENDADO — que é justamente quem precisa confirmar.
                    E168/G13+G14: a fila virou componente próprio, com a régua
                    de `mensagens-do-dia` e o gate de `agenda.editar`. */}
                <FilaFaltaProcurar
                  atendimentos={doDia}
                  nomePorLead={nomePorLead}
                  linkWa={waConfirmacao}
                  podeEditar={podeEditar}
                  onProcurou={(atendimentoId) =>
                    registrarContato.mutate({ lojaId: activeLojaId!, atendimentoId })
                  }
                />
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
                    {/* E130/A1: cabine e vestido falam a mesma língua (a
                        tabela semântica) — inativa é `outline`, apagada. */}
                    <Badge variant={varianteAtivo(cabine.ativo ?? true)}>{cabine.ativo ? 'Ativa' : 'Inativa'}</Badge>
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
