import { useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  useListLeads,
  getListLeadsQueryKey,
  useUpdateLead,
  type Lead,
  type ListLeadsParams,
  type LeadUpdatePerdidaMotivo,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { etapaLabel, PERDIDA_MOTIVO_LABELS } from "@/lib/formatos";
import {
  ETAPAS_LEAD,
  transicaoLeadValida,
  leadParado,
  rotuloParado,
  type EtapaLead,
} from "@/lib/funil";
import { dataCurtaFmt } from "./helpers";

/**
 * O funil kanban (E27). Cada etapa é uma coluna e o card se arrasta de uma para
 * a outra; a lista em grid continua existindo ao lado, no alternador.
 *
 * Duas decisões que moldam o arquivo:
 *
 * 1. **Uma query por coluna, paginada.** Um kanban "natural" baixaria a loja
 *    inteira e distribuiria em memória — exatamente o que o E7 tirou da lista.
 *    Cada coluna pede só a sua etapa, e o `total` do envelope dá a contagem do
 *    cabeçalho de graça, sem carregar o que não cabe na tela.
 * 2. **A régua de transição é a do servidor.** `transicaoLeadValida` vem do
 *    `@workspace/funil-core`, o mesmo módulo que a rota usa para devolver 422.
 *    As colunas que recusariam o drop nem aceitam o card — o erro aparece como
 *    coluna apagada durante o arraste, não como toast depois da animação.
 */

const POR_COLUNA = 25;

export function FunilNoivas({
  lojaId,
  activeLojaId,
  busca,
  podeEditar,
}: {
  lojaId: string;
  activeLojaId: string;
  /** Busca já debounced da tela pai — o funil filtra junto com a lista. */
  busca: string;
  podeEditar: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateLead = useUpdateLead();

  const [arrastando, setArrastando] = useState<Lead | null>(null);
  // Soltar em PERDIDO não pode ir direto ao servidor: a rota exige o motivo
  // estruturado (422 MOTIVO_OBRIGATORIO). O drop fica pendente até o diálogo.
  const [perdendo, setPerdendo] = useState<Lead | null>(null);
  const [motivoPerda, setMotivoPerda] = useState<LeadUpdatePerdidaMotivo | "">("");

  const sensores = useSensors(
    // 8px antes de virar arraste: o card tem link de detalhes dentro, e um
    // clique trêmulo não pode virar mudança de etapa.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // No celular o toque precisa de espera, senão o scroll da coluna arrasta card.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  /** Só as colunas tocadas pelo movimento — não os 11 refetches do prefixo. */
  async function invalidarColunas(etapas: EtapaLead[]) {
    await Promise.all(
      etapas.map((etapa) =>
        queryClient.invalidateQueries({
          queryKey: getListLeadsQueryKey(activeLojaId, paramsDaColuna(etapa, busca)),
        }),
      ),
    );
  }

  async function moverPara(lead: Lead, destino: EtapaLead, perda?: { motivo: LeadUpdatePerdidaMotivo }) {
    const origem = lead.etapa as EtapaLead;
    try {
      await updateLead.mutateAsync({
        lojaId: activeLojaId,
        leadId: lead.id,
        data: { etapa: destino, ...(perda ? { perdidaMotivo: perda.motivo } : {}) },
      });
      await invalidarColunas([origem, destino]);
      toast({
        title: `${lead.noivaNome} → ${etapaLabel(destino)}`,
      });
    } catch (err) {
      toast({
        title: "Não foi possível mover",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  function aoSoltar(evento: DragEndEvent) {
    const lead = arrastando;
    setArrastando(null);
    if (!lead || !evento.over) return;

    const destino = evento.over.id as EtapaLead;
    if (destino === lead.etapa) return;

    if (destino === "PERDIDO") {
      setMotivoPerda("");
      setPerdendo(lead);
      return;
    }
    void moverPara(lead, destino);
  }

  function confirmarPerda() {
    if (!perdendo || !motivoPerda) return;
    const lead = perdendo;
    const motivo = motivoPerda;
    setPerdendo(null);
    setMotivoPerda("");
    void moverPara(lead, "PERDIDO", { motivo });
  }

  function aoPegar(evento: DragStartEvent) {
    setArrastando((evento.active.data.current?.lead as Lead) ?? null);
  }

  return (
    <>
      <DndContext sensors={sensores} onDragStart={aoPegar} onDragEnd={aoSoltar}>
        <div className="flex gap-4 overflow-x-auto pb-4" data-testid="funil-noivas">
          {ETAPAS_LEAD.map((etapa) => (
            <ColunaFunil
              key={etapa}
              etapa={etapa}
              activeLojaId={activeLojaId}
              lojaId={lojaId}
              busca={busca}
              podeEditar={podeEditar}
              arrastando={arrastando}
            />
          ))}
        </div>

        {/* O card acompanha o cursor; sem isto ele fica preso no overflow da coluna. */}
        <DragOverlay>
          {arrastando ? (
            <div className="rotate-2 opacity-90">
              <CardNoiva lead={arrastando} lojaId={lojaId} arrastavel={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AlertDialog open={!!perdendo} onOpenChange={(aberto) => !aberto && setPerdendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar {perdendo?.noivaNome} como perdida?</AlertDialogTitle>
            <AlertDialogDescription>
              Perder pede o motivo — é o que faz o relatório de conversão responder
              por que o funil vaza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-perda-funil">Motivo</Label>
            <Select
              value={motivoPerda}
              onValueChange={(v) => setMotivoPerda(v as LeadUpdatePerdidaMotivo)}
            >
              <SelectTrigger id="motivo-perda-funil" data-testid="select-motivo-perda-funil">
                <SelectValue placeholder="Escolha o motivo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERDIDA_MOTIVO_LABELS).map(([valor, rotulo]) => (
                  <SelectItem key={valor} value={valor}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!motivoPerda}
              onClick={confirmarPerda}
              data-testid="button-confirmar-perda-funil"
            >
              Marcar como perdida
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Params da coluna. Extraído porque a chave de invalidação precisa bater exatamente. */
function paramsDaColuna(etapa: EtapaLead, busca: string): ListLeadsParams {
  return {
    etapa: etapa as ListLeadsParams["etapa"],
    ...(busca ? { q: busca } : {}),
    pagina: 1,
    porPagina: POR_COLUNA,
    // A coluna mostra uma página só: a noiva que acabou de chegar precisa estar
    // no topo, não na página 2 atrás de trinta contatos antigos.
    ordem: "recentes",
  };
}

function ColunaFunil({
  etapa,
  activeLojaId,
  lojaId,
  busca,
  podeEditar,
  arrastando,
}: {
  etapa: EtapaLead;
  activeLojaId: string;
  lojaId: string;
  busca: string;
  podeEditar: boolean;
  arrastando: Lead | null;
}) {
  const params = paramsDaColuna(etapa, busca);
  const { data, isLoading } = useListLeads(activeLojaId, params, {
    query: {
      queryKey: getListLeadsQueryKey(activeLojaId, params),
      enabled: !!activeLojaId,
      placeholderData: keepPreviousData,
    },
  });

  // Enquanto nada é arrastado a coluna não é alvo de nada: `aceita` só decide a
  // aparência durante o arraste.
  const aceita = arrastando
    ? arrastando.etapa !== etapa &&
      transicaoLeadValida(arrastando.etapa as EtapaLead, etapa)
    : true;

  const { setNodeRef, isOver } = useDroppable({ id: etapa, disabled: !podeEditar || !aceita });

  const itens = data?.itens ?? [];
  const total = data?.total ?? 0;

  return (
    <div
      ref={setNodeRef}
      data-testid={`coluna-funil-${etapa}`}
      className={[
        "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
        isOver ? "border-primary bg-primary/5" : "",
        arrastando && !aceita ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2">
        <span className="truncate text-sm font-medium">{etapaLabel(etapa)}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{total}</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {isLoading ? (
          <Card className="h-24 animate-pulse" />
        ) : itens.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {arrastando && aceita ? "Solte aqui" : "Vazia"}
          </p>
        ) : (
          itens.map((lead) => (
            <CardNoiva
              key={lead.id}
              lead={lead}
              lojaId={lojaId}
              arrastavel={podeEditar}
              escondido={arrastando?.id === lead.id}
            />
          ))
        )}
        {total > itens.length && (
          // A coluna mostra uma página. Dizer isso é melhor do que a vendedora
          // achar que a etapa tem 25 noivas quando tem 300.
          <p className="px-1 pt-1 text-center text-xs text-muted-foreground">
            + {total - itens.length} — refine a busca
          </p>
        )}
      </div>
    </div>
  );
}

function CardNoiva({
  lead,
  lojaId,
  arrastavel,
  escondido,
}: {
  lead: Lead;
  lojaId: string;
  arrastavel: boolean;
  escondido?: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: lead.id,
    data: { lead },
    disabled: !arrastavel,
  });

  const parado = leadParado({
    etapa: lead.etapa as EtapaLead,
    createdAt: lead.createdAt,
    ultimoContatoEm: lead.ultimoContatoEm,
  });
  const alerta = parado && parado.temperatura !== "ok";

  return (
    <Card
      ref={setNodeRef}
      data-testid={`card-funil-${lead.id}`}
      className={escondido ? "opacity-30" : undefined}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          {arrastavel && (
            <button
              type="button"
              className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
              aria-label={`Arrastar ${lead.noivaNome} para outra etapa`}
              {...listeners}
              {...attributes}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <Link
              to={`/loja/${lojaId}/noivas/${lead.id}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {lead.noivaNome}
            </Link>
            {lead.casamentoData && (
              <span className="block text-xs text-muted-foreground">
                {dataCurtaFmt.format(new Date(lead.casamentoData))}
              </span>
            )}
          </div>
        </div>

        {alerta && (
          <Badge
            variant={parado.temperatura === "critico" ? "destructive" : "secondary"}
            className="text-xs font-normal"
            data-testid={`badge-parado-${lead.id}`}
          >
            {rotuloParado(parado)}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
