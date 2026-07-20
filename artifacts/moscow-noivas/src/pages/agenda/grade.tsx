import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  useUpdateAtendimento,
  getListAtendimentosQueryKey,
  type Atendimento,
  type Cabine,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  slotsDoDia,
  slotDe,
  instanteDoSlot,
  chaveCelula,
  lerChaveCelula,
  recusaDeMover,
  DETALHE_RECUSA,
  type Expediente,
} from "@/lib/agenda";

/**
 * A grade do dia (E28): colunas = cabine, linhas = slot de 30 min. Substituiu a
 * lista vertical de "Atendimentos do Dia", que mostrava o horário como texto e
 * não tinha onde soltar nada.
 *
 * Por que arrastar e não um formulário: a vendedora reagenda de pé no salão, com
 * o celular na mão — abrir o atendimento, achar o campo de data e digitar um
 * horário é o gesto errado para "essa noiva passa para a cabine 2, meia hora
 * depois".
 *
 * A malha de 30 min é convenção da tela, não do domínio: a tabela guarda só
 * `inicio`, sem duração. Atendimento marcado fora da malha (a criação usa
 * datetime-local livre) cai no slot que o contém; fora do expediente não tem
 * célula e aparece na lista abaixo da grade, para não sumir.
 */

const SITUACAO_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
};

export function GradeDoDia({
  activeLojaId,
  diaYMD,
  atendimentos,
  cabines,
  expediente,
  podeEditar,
  nomePorLead,
}: {
  activeLojaId: string;
  /** Dia "YYYY-MM-DD" no fuso da loja. */
  diaYMD: string;
  /** Já filtrados para o dia. */
  atendimentos: Atendimento[];
  cabines: Cabine[];
  expediente: Expediente;
  podeEditar: boolean;
  nomePorLead: Map<string, string>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateAtendimento = useUpdateAtendimento();
  const [arrastando, setArrastando] = useState<Atendimento | null>(null);

  const sensores = useSensors(
    // 8px antes de virar arraste: o card tem conteúdo clicável dentro.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // No celular o toque precisa de espera, senão a rolagem da grade rouba o gesto.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const slots = useMemo(
    () => slotsDoDia(expediente.aberturaHora, expediente.fechamentoHora),
    [expediente.aberturaHora, expediente.fechamentoHora],
  );

  const cabinesAtivas = useMemo(() => cabines.filter((c) => c.ativo), [cabines]);

  // Cada atendimento no seu par (cabine, slot). Os que caem fora do expediente
  // não têm célula — vão para `orfaos` em vez de desaparecer da tela.
  const { porCelula, orfaos } = useMemo(() => {
    const mapa = new Map<string, Atendimento[]>();
    const fora: Atendimento[] = [];
    for (const a of atendimentos) {
      const slot = slotDe(a.inicio, expediente.aberturaHora, expediente.fechamentoHora);
      if (!slot) {
        fora.push(a);
        continue;
      }
      const chave = chaveCelula(a.cabineId, slot);
      const lista = mapa.get(chave);
      if (lista) lista.push(a);
      else mapa.set(chave, [a]);
    }
    return { porCelula: mapa, orfaos: fora };
  }, [atendimentos, expediente.aberturaHora, expediente.fechamentoHora]);

  async function aoSoltar(evento: DragEndEvent) {
    const movida = arrastando;
    setArrastando(null);
    if (!movida || !evento.over) return;

    const destino = lerChaveCelula(String(evento.over.id));
    if (!destino) return;

    const inicio = instanteDoSlot(diaYMD, destino.slot);
    // Soltar de volta onde já estava não é um movimento.
    if (destino.cabineId === movida.cabineId && inicio.getTime() === new Date(movida.inicio).getTime()) {
      return;
    }

    try {
      await updateAtendimento.mutateAsync({
        lojaId: activeLojaId,
        atendimentoId: movida.id,
        data: { cabineId: destino.cabineId, inicio: inicio.toISOString() },
      });
      await queryClient.invalidateQueries({
        queryKey: getListAtendimentosQueryKey(activeLojaId),
      });
      const cabine = cabinesAtivas.find((c) => c.id === destino.cabineId);
      toast({
        title: `${nomePorLead.get(movida.leadId) ?? "Atendimento"} → ${cabine?.nome ?? "cabine"}, ${destino.slot}`,
      });
    } catch (err) {
      toast({
        title: "Não foi possível reagendar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  if (cabinesAtivas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma cabine ativa — a grade do dia precisa de ao menos uma.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensores}
      onDragStart={(e: DragStartEvent) =>
        setArrastando((e.active.data.current?.atendimento as Atendimento) ?? null)
      }
      onDragEnd={aoSoltar}
    >
      <div className="overflow-x-auto" data-testid="grade-agenda">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `4.5rem repeat(${cabinesAtivas.length}, minmax(10rem, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-10 bg-background" />
          {cabinesAtivas.map((cabine) => (
            <div
              key={cabine.id}
              className="border-b px-2 pb-2 text-center text-sm font-medium"
            >
              {cabine.nome}
            </div>
          ))}

          {slots.map((slot) => (
            <Fragment key={slot}>
              <div className="sticky left-0 z-10 border-t bg-background pr-2 pt-1 text-right text-xs tabular-nums text-muted-foreground">
                {slot}
              </div>
              {cabinesAtivas.map((cabine) => (
                <Celula
                  key={`${cabine.id}:${slot}`}
                  cabineId={cabine.id}
                  slot={slot}
                  diaYMD={diaYMD}
                  ocupantes={porCelula.get(chaveCelula(cabine.id, slot)) ?? []}
                  arrastando={arrastando}
                  atendimentosDoDia={atendimentos}
                  expediente={expediente}
                  podeEditar={podeEditar}
                  nomePorLead={nomePorLead}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      {orfaos.length > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            Fora do expediente ({expediente.aberturaHora}h–{expediente.fechamentoHora}h) — sem
            célula na grade:
          </p>
          {orfaos.map((a) => (
            <div key={a.id} className="text-sm" data-testid={`orfao-agenda-${a.id}`}>
              {new Intl.DateTimeFormat("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(a.inicio))}{" "}
              — {nomePorLead.get(a.leadId) ?? "Noiva"}
            </div>
          ))}
        </div>
      )}

      {/* Sem overlay o card fica preso no overflow-x da grade. */}
      <DragOverlay>
        {arrastando ? (
          <div className="rotate-2 opacity-90">
            <CartaoAtendimento
              atendimento={arrastando}
              nome={nomePorLead.get(arrastando.leadId) ?? "Noiva"}
              arrastavel={false}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Celula({
  cabineId,
  slot,
  diaYMD,
  ocupantes,
  arrastando,
  atendimentosDoDia,
  expediente,
  podeEditar,
  nomePorLead,
}: {
  cabineId: string;
  slot: string;
  diaYMD: string;
  ocupantes: Atendimento[];
  arrastando: Atendimento | null;
  atendimentosDoDia: Atendimento[];
  expediente: Expediente;
  podeEditar: boolean;
  nomePorLead: Map<string, string>;
}) {
  // A MESMA função que o PATCH consulta: a célula que o servidor recusaria não
  // aceita o card, em vez de aceitar e devolver 422 depois da animação.
  const recusa = arrastando
    ? recusaDeMover(
        arrastando,
        { cabineId, inicio: instanteDoSlot(diaYMD, slot) },
        atendimentosDoDia,
        expediente,
      )
    : null;
  const aceita = !recusa;

  const { setNodeRef, isOver } = useDroppable({
    id: chaveCelula(cabineId, slot),
    disabled: !podeEditar || !aceita,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`celula-agenda-${cabineId}-${slot}`}
      title={recusa ? DETALHE_RECUSA[recusa] : undefined}
      className={[
        "min-h-12 border-l border-t p-1 transition-colors",
        isOver ? "bg-primary/10 ring-1 ring-primary ring-inset" : "",
        arrastando && !aceita ? "opacity-30" : "",
      ].join(" ")}
    >
      {ocupantes.map((a) => (
        <CartaoAtendimento
          key={a.id}
          atendimento={a}
          nome={nomePorLead.get(a.leadId) ?? "Noiva"}
          arrastavel={podeEditar}
          escondido={arrastando?.id === a.id}
        />
      ))}
    </div>
  );
}

function CartaoAtendimento({
  atendimento,
  nome,
  arrastavel,
  escondido,
}: {
  atendimento: Atendimento;
  nome: string;
  arrastavel: boolean;
  escondido?: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: atendimento.id,
    data: { atendimento },
    disabled: !arrastavel,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid={`card-agenda-${atendimento.id}`}
      className={[
        "rounded-md border bg-card p-1.5 text-xs shadow-sm",
        escondido ? "opacity-30" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-1">
        {arrastavel && (
          <button
            type="button"
            // touch-none impede a rolagem da grade de roubar o gesto no celular.
            className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label={`Arrastar atendimento de ${nome} para outro horário`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{nome}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
          {atendimento.tipo === "PROVA" ? "Prova" : "Atend."}
        </Badge>
        <span className="truncate text-[10px] text-muted-foreground">
          {SITUACAO_LABELS[atendimento.situacao] ?? atendimento.situacao}
        </span>
      </div>
    </div>
  );
}
