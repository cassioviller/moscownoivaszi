import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useUpdateAtendimento,
  useListEquipe,
  getListEquipeQueryKey,
  type Atendimento,
  type AtendimentoUpdate,
  type AtendimentoUpdateDesfecho,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle, CalendarDays, MessageCircle, Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { podeNoModulo } from "@/lib/permissoes";
import { linkWhatsApp, msgConfirmacaoAtendimento } from "@/lib/whatsapp";

const TODAS = "TODAS";

const SITUACAO_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

const DESFECHO_LABELS: Record<string, string> = {
  RESERVOU: "Reservou",
  VAI_PENSAR: "Vai pensar",
  NAO_SERVIU: "Não serviu",
};

const DESFECHOS = ["RESERVOU", "VAI_PENSAR", "NAO_SERVIU"] as const;

const horaFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" });

type Confirmacao = {
  titulo: string;
  descricao: string;
  acao: () => void;
};

/**
 * Atendimentos — a FILA DE TRABALHO (o ato de "atender"), distinta de Agendar
 * (/atendimentos/novo, que marca horário). A vendedora inicia, conclui (com
 * desfecho) ou marca falta; cada linha leva ao perfil da noiva.
 * Porte da tela do feat/orcamentos para o stack do main (react-query + client gerado).
 */
export default function Atendimentos() {
  const { lojaId } = useParams();
  const { activeLojaId, acessosModulos, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const historico = searchParams.get("quando") === "historico";

  const [busca, setBusca] = useState("");
  const [vendedoraFiltro, setVendedoraFiltro] = useState(TODAS);
  const [situacaoFiltro, setSituacaoFiltro] = useState(TODAS);
  const [desfechos, setDesfechos] = useState<Record<string, AtendimentoUpdateDesfecho>>({});
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  const atendimentos = useListAtendimentos(activeLojaId!, {
    query: { queryKey: getListAtendimentosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const equipe = useListEquipe(activeLojaId!, {
    query: { queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const updateAtendimento = useUpdateAtendimento();

  // Atendimento é do módulo `agenda` no backend, não `leads`.
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");

  // Situações válidas DESTA vista (abertas na fila, fechadas no histórico).
  const opcoesSituacao = historico
    ? [
        { value: "CONCLUIDO", rotulo: "Concluído" },
        { value: "FALTOU", rotulo: "Faltou" },
      ]
    : [
        { value: "AGENDADO", rotulo: "Agendado" },
        { value: "EM_ATENDIMENTO", rotulo: "Em atendimento" },
      ];
  const situacaoValida = opcoesSituacao.some((o) => o.value === situacaoFiltro)
    ? situacaoFiltro
    : TODAS;

  const lista = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    const filtrada = (atendimentos.data ?? [])
      .filter((a) => a.tipo === "ATENDIMENTO")
      .filter((a) =>
        historico
          ? a.situacao === "CONCLUIDO" || a.situacao === "FALTOU"
          : a.situacao === "AGENDADO" || a.situacao === "EM_ATENDIMENTO",
      )
      .filter((a) => situacaoValida === TODAS || a.situacao === situacaoValida)
      .filter((a) => vendedoraFiltro === TODAS || a.vendedoraId === vendedoraFiltro)
      .filter(
        (a) => !buscaLower || (a.lead?.noivaNome ?? "").toLowerCase().includes(buscaLower),
      );
    // Fila em ordem cronológica; histórico do mais recente para o mais antigo.
    return filtrada.sort((x, y) => {
      const dx = new Date(x.inicio).getTime();
      const dy = new Date(y.inicio).getTime();
      return historico ? dy - dx : dx - dy;
    });
  }, [atendimentos.data, historico, situacaoValida, vendedoraFiltro, busca]);

  const temFiltro = Boolean(busca.trim() || vendedoraFiltro !== TODAS || situacaoValida !== TODAS);

  // Fila (abertos): atrasados (data vencida, ainda em aberto), hoje e próximos.
  const { atrasados, deHoje, proximos } = useMemo(() => {
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const inicioAmanha = new Date(inicioHoje);
    inicioAmanha.setDate(inicioAmanha.getDate() + 1);
    const t0 = inicioHoje.getTime();
    const t1 = inicioAmanha.getTime();
    if (historico) return { atrasados: [], deHoje: [], proximos: [] };
    return {
      atrasados: lista.filter((a) => new Date(a.inicio).getTime() < t0),
      deHoje: lista.filter((a) => {
        const t = new Date(a.inicio).getTime();
        return t >= t0 && t < t1;
      }),
      proximos: lista.filter((a) => new Date(a.inicio).getTime() >= t1),
    };
  }, [lista, historico]);

  const aplicar = async (a: Atendimento, data: AtendimentoUpdate, mensagem: string) => {
    try {
      await updateAtendimento.mutateAsync({
        lojaId: activeLojaId!,
        atendimentoId: a.id,
        data,
      });
      await queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) });
      toast({ title: mensagem });
    } catch (err) {
      toast({
        title: "Essa mudança não é possível agora",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // E8: confirmar por wa.me na véspera (ou quando for) — só faz sentido para
  // quem ainda está AGENDADO; nome/endereço da loja vêm da sessão.
  const lojaAtiva = session?.lojas?.find((l) => l.id === activeLojaId);

  const renderLinha = (a: Atendimento, comData?: boolean) => {
    const noivaNome = a.lead?.noivaNome ?? "Noiva";
    const desfechoEscolhido = desfechos[a.id];
    const wa =
      a.situacao === "AGENDADO"
        ? linkWhatsApp(
            a.lead?.whatsapp,
            msgConfirmacaoAtendimento({
              noivaNome: a.lead?.noivaNome,
              tipo: a.tipo,
              inicio: a.inicio,
              lojaNome: lojaAtiva?.nome,
              endereco: lojaAtiva?.endereco,
            }),
          )
        : null;
    return (
      <li key={a.id} className="flex items-start gap-4 px-4 py-3" data-testid={`linha-atendimento-${a.id}`}>
        <div className="flex w-16 shrink-0 flex-col items-center">
          <span className="text-lg font-serif leading-none tabular-nums">
            {horaFmt.format(new Date(a.inicio))}
          </span>
          {comData && (
            <span className="mt-1 text-center text-xs text-muted-foreground">
              {dataFmt.format(new Date(a.inicio))}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link
              to={`/loja/${lojaId}/noivas/${a.leadId}`}
              className="w-fit font-medium hover:underline"
            >
              {noivaNome}
            </Link>
            <span className="text-xs text-muted-foreground">
              {a.cabine?.nome ?? "Cabine"} · {a.vendedora?.nome ?? "Vendedora"}
            </span>
          </span>

          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge variant="secondary">
              {SITUACAO_LABELS[a.situacao] ?? a.situacao}
              {a.situacao === "CONCLUIDO" && a.desfecho
                ? ` · ${DESFECHO_LABELS[a.desfecho] ?? a.desfecho}`
                : ""}
            </Badge>

            {wa && (
              <Button asChild variant="outline" size="sm">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-1 h-4 w-4" />
                  Confirmar por WhatsApp
                </a>
              </Button>
            )}

            {podeEditar && a.situacao === "AGENDADO" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updateAtendimento.isPending}
                  onClick={() => aplicar(a, { situacao: "EM_ATENDIMENTO" }, "Atendimento iniciado")}
                >
                  Iniciar atendimento
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={updateAtendimento.isPending}
                  onClick={() =>
                    setConfirmacao({
                      titulo: "Registrar falta?",
                      descricao: `Registrar falta de ${noivaNome}?`,
                      acao: () => aplicar(a, { situacao: "FALTOU" }, "Falta registrada"),
                    })
                  }
                >
                  Marcou falta
                </Button>
              </>
            )}

            {podeEditar && a.situacao === "EM_ATENDIMENTO" && (
              <>
                {/* GAP Onda 3 (orçamentos): "Abrir orçamento" a partir do atendimento —
                    sem endpoint de criação de orçamento por atendimentoId no client gerado. */}
                <Select
                  value={desfechoEscolhido ?? ""}
                  onValueChange={(v) =>
                    setDesfechos((prev) => ({ ...prev, [a.id]: v as AtendimentoUpdateDesfecho }))
                  }
                >
                  <SelectTrigger className="h-8 w-40" aria-label="Desfecho do atendimento">
                    <SelectValue placeholder="Como terminou?" />
                  </SelectTrigger>
                  <SelectContent>
                    {DESFECHOS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {DESFECHO_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={updateAtendimento.isPending || !desfechoEscolhido}
                  onClick={() =>
                    setConfirmacao({
                      titulo: "Concluir atendimento?",
                      descricao: `Concluir o atendimento de ${noivaNome}?`,
                      acao: () =>
                        aplicar(
                          a,
                          { situacao: "CONCLUIDO", desfecho: desfechoEscolhido },
                          "Atendimento concluído",
                        ),
                    })
                  }
                >
                  Concluir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={updateAtendimento.isPending}
                  onClick={() => aplicar(a, { situacao: "AGENDADO" }, "Voltou para agendado")}
                >
                  Voltar para agendado
                </Button>
              </>
            )}

            {podeEditar && (a.situacao === "CONCLUIDO" || a.situacao === "FALTOU") && (
              <Button
                variant="outline"
                size="sm"
                disabled={updateAtendimento.isPending}
                onClick={() => aplicar(a, { situacao: "AGENDADO" }, "Atendimento reaberto")}
              >
                Reabrir
              </Button>
            )}
          </span>
        </div>
      </li>
    );
  };

  const listaClasses = "flex flex-col divide-y rounded-lg border bg-card";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif">
            {historico ? "Atendimentos anteriores" : "Atendimentos"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {historico
              ? "Os atendimentos já finalizados."
              : "Receba a noiva, registre o atendimento e o desfecho."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* A fila é o trabalho do dia; a agenda é a visão no tempo. */}
          <Button asChild variant="outline">
            <Link to={`/loja/${lojaId}/agenda`}>
              <CalendarDays className="h-4 w-4 mr-2" />
              Ver agenda
            </Link>
          </Button>
          {podeEditar && (
            <Button asChild>
              <Link to={`/loja/${lojaId}/atendimentos/novo`}>
                <Plus className="h-4 w-4 mr-2" />
                Agendar
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar noiva…"
            aria-label="Buscar noiva pelo nome"
            className="w-56 pl-9"
          />
        </div>
        <Select value={vendedoraFiltro} onValueChange={setVendedoraFiltro}>
          <SelectTrigger className="w-52" aria-label="Filtrar por vendedora">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as vendedoras</SelectItem>
            {(equipe.data ?? []).map((m) => (
              <SelectItem key={m.usuarioId} value={m.usuarioId}>
                {m.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={situacaoValida} onValueChange={setSituacaoFiltro}>
          <SelectTrigger className="w-48" aria-label="Filtrar por situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as situações</SelectItem>
            {opcoesSituacao.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {atendimentos.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar os atendimentos</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            <span>Falha ao buscar a fila.</span>
            <Button variant="outline" size="sm" onClick={() => atendimentos.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : atendimentos.isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-md" />
          ))}
        </div>
      ) : temFiltro && lista.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm">Nenhum atendimento com esses filtros.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBusca("");
              setVendedoraFiltro(TODAS);
              setSituacaoFiltro(TODAS);
            }}
          >
            Limpar filtros
          </Button>
        </div>
      ) : historico ? (
        lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum atendimento finalizado ainda.</p>
        ) : (
          <ul className={listaClasses}>{lista.map((a) => renderLinha(a, true))}</ul>
        )
      ) : (
        <div className="space-y-8">
          {atrasados.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-widest text-destructive">
                Atrasados
              </h2>
              <ul className={listaClasses}>{atrasados.map((a) => renderLinha(a, true))}</ul>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Hoje
            </h2>
            {deHoje.length === 0 ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm text-muted-foreground">Nenhum atendimento hoje.</p>
                {podeEditar && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/loja/${lojaId}/atendimentos/novo`}>Agendar um atendimento</Link>
                  </Button>
                )}
              </div>
            ) : (
              <ul className={listaClasses}>{deHoje.map((a) => renderLinha(a))}</ul>
            )}
          </section>

          {proximos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Próximos
              </h2>
              <ul className={listaClasses}>{proximos.map((a) => renderLinha(a, true))}</ul>
            </section>
          )}
        </div>
      )}

      <div className="border-t pt-5">
        <Link
          to={
            historico
              ? `/loja/${lojaId}/atendimentos`
              : `/loja/${lojaId}/atendimentos?quando=historico`
          }
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {historico ? "← Voltar à fila de atendimentos" : "Ver atendimentos anteriores"}
        </Link>
      </div>

      <AlertDialog open={!!confirmacao} onOpenChange={(aberto) => !aberto && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmacao?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmacao?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateAtendimento.isPending}
              onClick={() => {
                confirmacao?.acao();
                setConfirmacao(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
