import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetVestido,
  getGetVestidoQueryKey,
  useListBloqueios,
  getListBloqueiosQueryKey,
  useListLeads,
  getListLeadsQueryKey,
  useCheckDisponibilidadeVestidos,
  getCheckDisponibilidadeVestidosQueryKey,
  getGetVestidoFotoUrl,
} from "@workspace/api-client-react";
import type { BloqueioVestido, Lead } from "@workspace/api-client-react";
import { useRoute } from "@/lib/router-compat";
import { format, parseISO } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Image as ImageIcon } from "lucide-react";

/**
 * Período exibido de um bloqueio.
 *
 * DÉBITO (provisório): o backend materializa o envelope físico em
 * ocupacao_inicio/ocupacao_fim, mas o schema BloqueioVestido da API ainda não
 * expõe esses campos. Até lá, derivamos o período das datas conhecidas do
 * bloqueio (inicio/fim para manutenção; retirada/devolução/casamento para
 * reserva) — pode subestimar as janelas de prova/lavagem.
 */
function periodoDoBloqueio(b: BloqueioVestido): { inicio: Date | null; fim: Date | null; rotuloFimAberto: string | null } {
  if (b.tipo === "MANUTENCAO") {
    return {
      inicio: b.inicio ? parseISO(b.inicio) : null,
      fim: b.fim ? parseISO(b.fim) : null,
      rotuloFimAberto: b.fim ? null : "sem prazo definido",
    };
  }
  const inicio = b.retiradaDataReal ?? b.casamentoData ?? null;
  // Retirado e ainda não devolvido → janela aberta ("até devolução").
  const fim = b.devolucaoDataReal ?? (b.retiradaDataReal ? null : b.casamentoData ?? null);
  return {
    inicio: inicio ? parseISO(inicio) : null,
    fim: fim ? parseISO(fim) : null,
    rotuloFimAberto: fim ? null : "até devolução",
  };
}

function textoPeriodo(b: BloqueioVestido): string {
  const { inicio, fim, rotuloFimAberto } = periodoDoBloqueio(b);
  if (!inicio) return rotuloFimAberto ?? "sem prazo definido";
  if (!fim) return `${format(inicio, "dd/MM")} – ${rotuloFimAberto}`;
  if (format(inicio, "yyyy-MM-dd") === format(fim, "yyyy-MM-dd")) return format(inicio, "dd/MM/yyyy");
  return `${format(inicio, "dd/MM")} – ${format(fim, "dd/MM")}`;
}

/** Bloqueio ainda relevante: janela aberta ou com fim de hoje em diante. */
function bloqueioFuturoOuAberto(b: BloqueioVestido, hoje: Date): boolean {
  const { fim } = periodoDoBloqueio(b);
  if (!fim) return true;
  const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  return fimDia.getTime() >= hoje.getTime();
}

export default function VestidoDetail() {
  const { activeLojaId } = useAuth();
  const [, params] = useRoute("/vestidos/:id");
  const id = params?.id;

  const {
    data: vestido,
    isLoading,
    isError: vestidoErro,
    error: vestidoErroDetalhe,
    refetch: recarregarVestido,
  } = useGetVestido(activeLojaId!, id!, {
    query: { queryKey: getGetVestidoQueryKey(activeLojaId!, id!), enabled: !!activeLojaId && !!id }
  });

  // Join client-side entre bloqueios e leads: PROVISÓRIO até o backend expor
  // filtro por vestido (GET /bloqueios?vestidoId=...) com noivaNome embutido.
  const bloqueiosQuery = useListBloqueios(activeLojaId!, {
    query: { queryKey: getListBloqueiosQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });
  const leadsQuery = useListLeads(activeLojaId!, {
    query: { queryKey: getListLeadsQueryKey(activeLojaId!), enabled: !!activeLojaId },
  });

  // "Estado atual" do vestido: consulta batch de disponibilidade com a data de
  // hoje (new Date() aqui é aceitável — é UI de estado presente).
  const hoje = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const disponibilidadeHoje = useCheckDisponibilidadeVestidos(
    activeLojaId!,
    { data: hoje },
    {
      query: {
        queryKey: getCheckDisponibilidadeVestidosQueryKey(activeLojaId!, { data: hoje }),
        enabled: !!activeLojaId && !!id,
      },
    },
  );
  const itemHoje = disponibilidadeHoje.data?.itens.find((item) => item.vestidoId === id);

  const leadsPorId = useMemo(() => {
    const mapa = new Map<string, Lead>();
    for (const lead of leadsQuery.data ?? []) mapa.set(lead.id, lead);
    return mapa;
  }, [leadsQuery.data]);

  const proximosBloqueios = useMemo(() => {
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    return (bloqueiosQuery.data ?? [])
      .filter((b) => b.vestidoId === id && b.canceladoEm == null && bloqueioFuturoOuAberto(b, inicioHoje))
      .sort((a, b) => {
        const inicioA = periodoDoBloqueio(a).inicio?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const inicioB = periodoDoBloqueio(b).inicio?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return inicioA - inicioB;
      });
  }, [bloqueiosQuery.data, id]);

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg"></div>;

  if (vestidoErro) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro ao carregar o vestido</AlertTitle>
        <AlertDescription className="flex items-center gap-3">
          <span>{vestidoErroDetalhe instanceof Error ? vestidoErroDetalhe.message : "Falha inesperada ao buscar o vestido."}</span>
          <Button variant="outline" size="sm" onClick={() => recarregarVestido()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!vestido) return <div>Vestido não encontrado.</div>;

  function renderBadgeHoje() {
    if (disponibilidadeHoje.isLoading) return <Skeleton className="h-6 w-28 rounded-full" />;
    if (!itemHoje || itemHoje.status === "INATIVO") return null;
    if (itemHoje.status === "DISPONIVEL") {
      return <Badge className="text-sm px-3 py-1">Disponível hoje</Badge>;
    }
    const badge =
      itemHoje.status === "MANUTENCAO" ? (
        <Badge variant="secondary" className="text-sm px-3 py-1">Em manutenção</Badge>
      ) : (
        <Badge variant="destructive" className="text-sm px-3 py-1">Indisponível hoje</Badge>
      );
    if (!itemHoje.motivo) return badge;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-64">{itemHoje.motivo}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-muted-foreground">{vestido.codigo}</div>
          <h1 className="text-3xl font-serif">{vestido.nome}</h1>
        </div>
        <div className="flex items-center gap-2">
          {renderBadgeHoje()}
          {vestido.status === "ativo" ? (
            <Badge variant="secondary" className="text-sm px-3 py-1">Ativo</Badge>
          ) : (
            <Badge variant="outline" className="text-sm px-3 py-1">Inativo</Badge>
          )}
        </div>
      </div>

      {vestido.fotos && vestido.fotos.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[...vestido.fotos]
            .sort((a, b) => a.ordem - b.ordem)
            .map((foto) => (
              <img
                key={foto.ordem}
                src={getGetVestidoFotoUrl(activeLojaId!, vestido.id, foto.ordem)}
                alt={`${vestido.nome} — foto ${foto.ordem + 1}`}
                loading="lazy"
                className="h-72 w-auto shrink-0 rounded-lg border object-cover"
              />
            ))}
        </div>
      ) : (
        <div className="flex aspect-[3/2] max-h-72 items-center justify-center rounded-lg border bg-muted">
          <ImageIcon className="h-10 w-10 text-muted-foreground opacity-50" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Preço Base</p>
                <p className="font-medium text-lg">R$ {vestido.precoBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Categoria</p>
                <p className="font-medium">{vestido.categoria || 'Não definida'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tamanho</p>
                <p className="font-medium">{vestido.tamanho || 'Não definido'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cor</p>
                <p className="font-medium">{vestido.cor || 'Não definida'}</p>
              </div>
            </div>

            {vestido.observacoes && (
              <div>
                <p className="text-muted-foreground text-sm">Observações</p>
                <p className="text-sm mt-1">{vestido.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos bloqueios</CardTitle>
          </CardHeader>
          <CardContent>
            {bloqueiosQuery.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao carregar os bloqueios</AlertTitle>
                <AlertDescription className="flex items-center gap-3">
                  <span>
                    {bloqueiosQuery.error instanceof Error
                      ? bloqueiosQuery.error.message
                      : "Falha inesperada ao buscar os bloqueios."}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => bloqueiosQuery.refetch()}>
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : bloqueiosQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : proximosBloqueios.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum bloqueio futuro.</p>
            ) : (
              <ul className="space-y-4">
                {proximosBloqueios.map((bloqueio) => {
                  const reserva = bloqueio.tipo === "RESERVA_CASAMENTO";
                  const noivaNome = bloqueio.leadId ? leadsPorId.get(bloqueio.leadId)?.noivaNome ?? "—" : "—";
                  return (
                    <li key={bloqueio.id} className="flex items-start gap-3 text-sm">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${reserva ? "bg-primary" : "bg-muted-foreground"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{textoPeriodo(bloqueio)}</span>
                          <Badge variant={reserva ? "secondary" : "outline"}>
                            {reserva ? "Reserva de casamento" : "Manutenção"}
                          </Badge>
                        </div>
                        {reserva && (
                          <p className="text-muted-foreground">
                            Noiva: {leadsQuery.isLoading ? "carregando…" : noivaNome}
                          </p>
                        )}
                        {bloqueio.observacao && (
                          <p className="text-xs text-muted-foreground">{bloqueio.observacao}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
