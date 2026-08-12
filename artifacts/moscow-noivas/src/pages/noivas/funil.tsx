import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Button } from "@/components/ui/button";
import { Erro } from "@/components/estado";
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
import { GripVertical, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { etapaLabel, PERDIDA_MOTIVO_LABELS } from "@/lib/formatos";
import {
  ETAPAS_LEAD,
  transicaoLeadValida,
  leadParado,
  rotuloParado,
  mostraSeloAceite,
  type EtapaLead,
} from "@/lib/funil";
import { diaMesAbrevAno } from "@/lib/formatos";
import { mensagemApi } from "@/lib/erro-api";

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
        title: "Não deu para mover",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  /** E136/E10: a mesma decisão do aoSoltar, para a porta sem arrasto. */
  function moverPorMenu(lead: Lead, destino: EtapaLead) {
    if (destino === lead.etapa) return;
    if (destino === "PERDIDO") {
      setMotivoPerda("");
      setPerdendo(lead);
      return;
    }
    void moverPara(lead, destino);
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
              onMover={moverPorMenu}
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
  onMover,
}: {
  etapa: EtapaLead;
  activeLojaId: string;
  lojaId: string;
  busca: string;
  podeEditar: boolean;
  arrastando: Lead | null;
  onMover: (lead: Lead, destino: EtapaLead) => void;
}) {
  const params = paramsDaColuna(etapa, busca);
  // E121/C3 — isError e refetch entram: a coluna dizia "Vazia" com total 0
  // quando a query falhava, indistinguível de um funil realmente vazio.
  const { data, isLoading, isError, error, refetch } = useListLeads(activeLojaId, params, {
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
        {/* E92/E23: <h2>, não <span>. A <h1> "Noivas" continua no topo em
            qualquer das duas vistas; o que faltava era o degrau abaixo dela —
            no funil, a etapa É a seção. */}
        <h2 className="truncate text-sm font-medium">{etapaLabel(etapa)}</h2>
        {/* Sem resposta não há contagem: "0" no topo da coluna é afirmação. */}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {data ? total : "—"}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {isError ? (
          <Erro titulo="A coluna não carregou" erro={error} onTentarNovamente={() => void refetch()} />
        ) : isLoading ? (
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
              onMover={(destino) => onMover(lead, destino)}
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
  onMover,
}: {
  lead: Lead;
  lojaId: string;
  arrastavel: boolean;
  escondido?: boolean;
  /** E136/E10: a porta SEM arrasto — soma ao drag, não o substitui. */
  onMover?: (destino: EtapaLead) => void;
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
                {diaMesAbrevAno(lead.casamentoData)}
              </span>
            )}
          </div>
          {/* E136/E10: mover etapa só existia por arrasto — quem navega por
              teclado não movia NUNCA, e no toque arrastar meia tela é
              pontaria. O menu SOMA ao arrasto (que está bem — delay 200ms). */}
          {arrastavel && onMover && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Mover ${lead.noivaNome} para outra etapa`}
                  data-testid={`mover-${lead.id}`}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ETAPAS_LEAD.filter((e) => e !== lead.etapa).map((etapa) => (
                  <DropdownMenuItem key={etapa} onSelect={() => onMover(etapa)}>
                    {etapaLabel(etapa)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {alerta && (
            <Badge
              variant={parado.temperatura === "critico" ? "destructive" : "secondary"}
              className="text-xs font-normal"
              data-testid={`badge-parado-${lead.id}`}
            >
              {rotuloParado(parado)}
            </Badge>
          )}
          {/**
           * S-O10 — o "sim" dela aparece no funil SEM virar coluna.
           *
           * O aceite não muda onde a noiva está: ela segue negociando, e o
           * card fica em "Orçamento aberto". Muda o que a LOJA tem de fazer —
           * e quem olha o funil para achar onde a venda emperrou não via essa
           * diferença. Uma décima segunda coluna resolveria a mesma coisa por
           * um preço muito maior: enum do banco, régua de transição, régua de
           * conversão, e um kanban que já se arrasta em onze no celular.
           *
           * O selo some quando o contrato fecha, porque aí o aceite virou
           * história — e o que o card precisa dizer é outra coisa.
           */}
          {mostraSeloAceite(lead) && (
            <Badge
              variant="outline"
              className="text-xs font-normal"
              data-testid={`badge-aceite-${lead.id}`}
            >
              Aceitou — falta o contrato
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
