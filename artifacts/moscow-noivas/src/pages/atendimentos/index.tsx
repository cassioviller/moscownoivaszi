import { varianteSituacao } from "@/lib/status-badge";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { comFiltros } from "@/lib/filtro-url";
import { useBuscaNaUrl } from "@/hooks/use-busca-na-url";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  useListAtendimentos,
  getListAtendimentosQueryKey,
  useUpdateAtendimento,
  useListEquipe,
  getListEquipeQueryKey,
  useCreateOrcamento,
  getListOrcamentosQueryKey,
  type Atendimento,
  type AtendimentoUpdate,
  type AtendimentoUpdateDesfecho,
} from "@workspace/api-client-react";
import { ToastAction } from "@/components/ui/toast";
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
import { addDias, inicioDoDia } from "@/lib/financeiro/datas";
import { useDiaLocal } from "@/hooks/use-dia-local";
import { instanteHora, instanteDiaMes } from "@/lib/formatos";
import { CACHE_ESTAVEL } from "@/lib/cache";
import { mensagemApi } from "@/lib/erro-api";

const TODAS = "TODAS";

/** E87: janela padrão da tela — os últimos 90 dias; "carregar mais antigo" dobra. */
const JANELA_PADRAO_DIAS = 90;

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


/**
 * O início REAL do atendimento (E36): a que horas de fato começou e o quanto
 * isso ficou depois do horário marcado. `atendidoEm` era coluna morta; agora
 * mede a espera da noiva sem depender de ninguém anotar nada.
 */
/**
 * "540 min adiantado" (E92/E16): ninguém pensa em 540 minutos — são 9 horas. A
 * partir de 90 min a diferença sai em h/min.
 */
function duracaoHumana(min: number): string {
  if (min < 90) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

function inicioReal(inicio: string, atendidoEm: string): string {
  const hora = instanteHora(atendidoEm);
  const min = Math.round((new Date(atendidoEm).getTime() - new Date(inicio).getTime()) / 60_000);
  if (min > 2) return `começou ${hora} · ${duracaoHumana(min)} após o horário`;
  if (min < -2) return `começou ${hora} · ${duracaoHumana(Math.abs(min))} adiantado`;
  return `começou ${hora} · no horário`;
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const historico = searchParams.get("quando") === "historico";

  // E129/D5: a fila era a tela mais cara do defeito — filtrar por si mesma,
  // abrir uma noiva e voltar zerava TUDO (busca, vendedora, situação, janela e
  // aba), 3+ gestos de novo a cada ida-e-volta do dia. Agora os filtros moram
  // na URL (`?quando=historico`, que já morava lá, atravessa intacto); a
  // filtragem continua client-side e instantânea — a busca filtra pelo que se
  // digita e a URL assenta 300ms atrás (`useBuscaNaUrl`).
  const [busca, setBusca] = useBuscaNaUrl();
  const vendedoraFiltro = searchParams.get("vendedora") ?? TODAS;
  const situacaoFiltro = searchParams.get("situacao") ?? TODAS;
  const janelaDias = (() => {
    const n = Number(searchParams.get("janela"));
    return Number.isInteger(n) && n >= JANELA_PADRAO_DIAS ? n : JANELA_PADRAO_DIAS;
  })();
  const aba: "ATENDIMENTO" | "PROVA" =
    searchParams.get("tipo") === "PROVA" ? "PROVA" : "ATENDIMENTO";
  const definirFiltroUrl = (nome: string, valor: string | number, padrao: string) =>
    setSearchParams((p) => comFiltros(p, { [nome]: valor }, { [nome]: padrao }), {
      replace: true,
    });
  const [desfechos, setDesfechos] = useState<Record<string, AtendimentoUpdateDesfecho>>({});
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  /**
   * F11/E97 — a aba. Uma PROVA não podia ser concluída em tela NENHUMA: esta
   * filtrava `tipo: "ATENDIMENTO"` e a tela de provas só lê. Toda prova ficava
   * em AGENDADO para sempre — prova esquecida não aparecia em lugar algum, o
   * contador do sino degradava com o tempo, e o `atendidoEm` do E36 nunca era
   * preenchido justamente para o atendimento mais demorado do ateliê.
   *
   * A aba reaproveita o agrupamento Atrasados/Hoje/Próximos e as ações de
   * linha inteiras — é menos código do que replicá-las em `/provas`, e a API
   * já aceitava (é o mesmo `PATCH /atendimentos/:id`).
   *
   * E87: a tela pede o RECORTE, não o acervo — dos últimos 90 dias em diante.
   * `de` sem `ate` de propósito: a janela padrão nunca pode esconder um
   * atendimento futuro. "Carregar mais antigo" dobra a janela; keepPreviousData
   * segura a lista atual enquanto a maior chega.
   */
  /**
   * **S-RM11 — os três baldes da fila só valem enquanto "hoje" for hoje.**
   *
   * A janela da consulta (`de`) e o corte `atrasados · hoje · próximos`
   * (`:236`) saem do mesmo dia. O corte morava num `useMemo` com
   * `[lista, historico]`: numa aba deixada aberta, a meia-noite passava e a
   * prova das 9h30 continuava em "Próximos", numa seção que a recepcionista já
   * tinha lido. O `useDiaLocal()` (E256) re-renderiza uma vez por virada, e é
   * o mesmo render que faz a janela virar chave nova.
   */
  const hoje = useDiaLocal();
  const paramsJanela = {
    tipo: aba,
    de: addDias(hoje, -janelaDias),
  };
  const atendimentos = useListAtendimentos(activeLojaId!, paramsJanela, {
    query: {
      queryKey: getListAtendimentosQueryKey(activeLojaId!, paramsJanela),
      enabled: !!activeLojaId,
      placeholderData: keepPreviousData,
    },
  });
  const equipe = useListEquipe(activeLojaId!, {
    query: { ...CACHE_ESTAVEL, queryKey: getListEquipeQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const updateAtendimento = useUpdateAtendimento();
  const createOrcamento = useCreateOrcamento();
  const navigate = useNavigate();

  // Atendimento é do módulo `agenda` no backend, não `leads`.
  const podeEditar = podeNoModulo(acessosModulos, "agenda", "editar");
  // Orçamento é do módulo `orcamentos` desde o E172 (era `leads`) — o atalho
  // pós-"Reservou" só aparece para quem pode criá-lo.
  const podeCriarOrcamento = podeNoModulo(acessosModulos, "orcamentos", "criar");

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

  // Filtros de situação/vendedora/busca seguem no cliente — sobre o RECORTE
  // que a janela pediu, não sobre o acervo (E87).
  const lista = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    const filtrada = (atendimentos.data ?? [])
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
    // "Hoje" é o dia da LOJA, não o do aparelho: `new Date()` +
    // `setHours(0,0,0,0)` dá a meia-noite do fuso do NAVEGADOR, e é a mesma
    // classe que o E111 achou quatro vezes no servidor. A vendedora com o
    // relógio fora de São Paulo lê a fila em três baldes trocados — atrasado
    // que não está, e o de hoje caindo em "próximos". S-RM11: a virada da
    // meia-noite numa aba aberta troca os mesmos três baldes, e por isso o dia
    // está nas dependências.
    const t0 = inicioDoDia(hoje).getTime();
    const t1 = inicioDoDia(addDias(hoje, 1)).getTime();
    if (historico) return { atrasados: [], deHoje: [], proximos: [] };
    return {
      atrasados: lista.filter((a) => new Date(a.inicio).getTime() < t0),
      deHoje: lista.filter((a) => {
        const t = new Date(a.inicio).getTime();
        return t >= t0 && t < t1;
      }),
      proximos: lista.filter((a) => new Date(a.inicio).getTime() >= t1),
    };
  }, [lista, historico, hoje]);

  // E61: "Reservou" é o momento mais quente da loja — o orçamento nasce daqui,
  // já amarrado à noiva e ao atendimento, sem a vendedora caçar outra tela.
  const abrirOrcamento = async (a: Atendimento) => {
    try {
      const criado = await createOrcamento.mutateAsync({
        lojaId: activeLojaId!,
        data: { leadId: a.leadId, atendimentoId: a.id },
      });
      await queryClient.invalidateQueries({ queryKey: getListOrcamentosQueryKey(activeLojaId!) });
      navigate(`/loja/${lojaId}/orcamentos/${criado.id}`);
    } catch (err) {
      toast({
        title: "Não deu para criar orçamento",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const aplicar = async (a: Atendimento, data: AtendimentoUpdate, mensagem: string) => {
    try {
      await updateAtendimento.mutateAsync({
        lojaId: activeLojaId!,
        atendimentoId: a.id,
        data,
      });
      await queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId!) });
      if (data.desfecho === "RESERVOU" && podeCriarOrcamento) {
        toast({
          title: mensagem,
          description: "Ela reservou — o próximo passo é o orçamento.",
          action: (
            <ToastAction altText="Abrir orçamento da noiva" onClick={() => abrirOrcamento(a)}>
              Abrir orçamento
            </ToastAction>
          ),
        });
        return;
      }
      toast({ title: mensagem });
    } catch (err) {
      toast({
        title: "Essa mudança não é possível agora",
        description: mensagemApi(err, "Tente novamente."),
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
            {instanteHora(a.inicio)}
          </span>
          {comData && (
            <span className="mt-1 text-center text-xs text-muted-foreground">
              {instanteDiaMes(a.inicio)}
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
            {/* E130/A1: era `secondary` fixo — "Faltou" saía no MESMO cinza de
                "Agendado", e o estado que pede reação não se distinguia sem
                ler. A variante vem da tabela semântica. */}
            <Badge variant={varianteSituacao(a.situacao)}>
              {SITUACAO_LABELS[a.situacao] ?? a.situacao}
              {a.situacao === "CONCLUIDO" && a.desfecho
                ? ` · ${DESFECHO_LABELS[a.desfecho] ?? a.desfecho}`
                : ""}
            </Badge>

            {a.atendidoEm && (a.situacao === "EM_ATENDIMENTO" || a.situacao === "CONCLUIDO") && (
              <span className="text-xs text-muted-foreground" data-testid={`inicio-real-${a.id}`}>
                {inicioReal(a.inicio, a.atendidoEm)}
              </span>
            )}

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

            {/* F14: o DURANTE do atendimento. Enquanto a noiva está na cabine,
                o que a vendedora preenche é interesse e lookbook — e daqui não
                havia caminho: era abrir a ficha e procurar as abas. Os dois
                links não dependem de `podeEditar` da agenda, porque quem
                registra interesse é o módulo de noivas. */}
            {a.situacao === "EM_ATENDIMENTO" && (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/loja/${lojaId}/noivas/${a.leadId}/interesses`}>Interesses</Link>
                </Button>
                {/* S-O38: o lookbook é um CARD da ficha — o `/lookbook` que
                    estava aqui nunca foi rota, e levava a "Não encontramos
                    esta página" no meio do atendimento. */}
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/loja/${lojaId}/noivas/${a.leadId}#lookbook`}>Lookbook</Link>
                </Button>
              </>
            )}

            {podeEditar && a.situacao === "EM_ATENDIMENTO" && (
              <>
                <Select
                  value={desfechoEscolhido ?? ""}
                  onValueChange={(v) =>
                    setDesfechos((prev) => ({ ...prev, [a.id]: v as AtendimentoUpdateDesfecho }))
                  }
                >
                  {/* S-D18: o único select do app com altura própria (32px,
                      denso porque vive dentro da linha da fila). O `min-h-11`
                      do primitivo o leva a 44px no mobile — `h-8` é `height`, e
                      `min-height` manda —, e o `md:min-h-8` devolve os 32px no
                      desktop, que é onde a densidade foi decidida. */}
                  <SelectTrigger className="h-8 w-40 md:min-h-8" aria-label="Desfecho do atendimento">
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
                {/* F15/E97: as confirmações estavam invertidas. "Concluir" —
                    reversível, e o desfecho já foi escolhido no seletor ao lado
                    — pedia um AlertDialog; "Voltar para agendado", que APAGA o
                    início real medido e o desfecho, não pedia nada. Agora
                    concluir é direto e desfazer é que avisa. */}
                <Button
                  size="sm"
                  disabled={updateAtendimento.isPending || !desfechoEscolhido}
                  onClick={() =>
                    aplicar(
                      a,
                      { situacao: "CONCLUIDO", desfecho: desfechoEscolhido },
                      "Atendimento concluído",
                    )
                  }
                >
                  Concluir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={updateAtendimento.isPending}
                  onClick={() =>
                    setConfirmacao({
                      titulo: "Voltar para agendado?",
                      descricao: a.atendidoEm
                        ? `O atendimento de ${noivaNome} volta a constar como não realizado: o horário de início já medido (${instanteHora(a.atendidoEm)}) e o desfecho são apagados, e não há como recuperá-los.`
                        : `O atendimento de ${noivaNome} volta a constar como não realizado, e o desfecho é apagado.`,
                      acao: () => aplicar(a, { situacao: "AGENDADO" }, "Voltou para agendado"),
                    })
                  }
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
                onClick={() =>
                  setConfirmacao({
                    titulo: "Reabrir este atendimento?",
                    descricao: a.atendidoEm
                      ? `Ele volta a constar como não realizado: o início já medido (${instanteHora(a.atendidoEm)}) e o desfecho são apagados.`
                      : "Ele volta a constar como não realizado, e o desfecho é apagado.",
                    acao: () => aplicar(a, { situacao: "AGENDADO" }, "Atendimento reaberto"),
                  })
                }
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
            {historico ? "Atendimentos anteriores" : "Atendimentos e provas"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {historico
              ? "Os atendimentos já finalizados."
              : aba === "PROVA"
                ? "Receba a noiva para a prova, registre como ela terminou."
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

      {/* F11: a aba que faltava. A PROVA usa a MESMA linha, as mesmas ações e o
          mesmo agrupamento — o que não existia era o caminho até ela.

          S-D18: a aba é um alvo de toque como qualquer outro, e a caixa dela
          soma 38px (py-2 8+8 + linha de 20px + border-b-2) — abaixo dos 44px
          que o E137 fixou para o Button. `min-h-11` no mobile, e no desktop o
          `md:min-h-9` (36px) fica abaixo dos 38px naturais: nada muda lá. */}
      <div className="flex gap-1 border-b" role="tablist" aria-label="Tipo de atendimento">
        {(["ATENDIMENTO", "PROVA"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={aba === t}
            onClick={() => definirFiltroUrl("tipo", t, "ATENDIMENTO")}
            className={`-mb-px min-h-11 border-b-2 px-4 py-2 text-sm font-medium transition-colors md:min-h-9 ${
              aba === t
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {t === "ATENDIMENTO" ? "Atendimentos" : "Provas"}
          </button>
        ))}
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
        <Select value={vendedoraFiltro} onValueChange={(v) => definirFiltroUrl("vendedora", v, TODAS)}>
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
        <Select value={situacaoValida} onValueChange={(v) => definirFiltroUrl("situacao", v, TODAS)}>
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
          <AlertTitle>Não deu para carregar os atendimentos</AlertTitle>
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
              definirFiltroUrl("vendedora", TODAS, TODAS);
              definirFiltroUrl("situacao", TODAS, TODAS);
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

      <div className="border-t pt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
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
        {/* E87: ver mais longe no passado é uma escolha explícita — dobra a janela. */}
        <span className="text-xs text-muted-foreground">
          Mostrando os últimos {janelaDias} dias (e tudo que vem pela frente).
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={atendimentos.isFetching}
          onClick={() => definirFiltroUrl("janela", janelaDias * 2, String(JANELA_PADRAO_DIAS))}
        >
          Carregar mais antigo
        </Button>
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
