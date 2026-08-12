import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  pointerWithin,
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
import { SeloProvaOrfa } from "@/components/selo-prova-orfa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { instanteHora } from "@/lib/formatos";
import { CalendarClock, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  slotsDoDia,
  slotDe,
  instanteDoSlot,
  horaLocal,
  chaveCelula,
  lerChaveCelula,
  recusaDeMover,
  DETALHE_RECUSA,
  type Expediente,
  type Ausencia,
} from "@/lib/agenda";
import { colunasDaGrade, opcoesDeReagendamento } from "@/lib/agenda-telas";
import { mensagemApi } from "@/lib/erro-api";

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
  ausencias,
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
  /** E151 — sem elas a grade aceitaria o card no dia de férias da vendedora. */
  ausencias: Ausencia[];
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

  /**
   * G6 (E168) — a cabine desativada com agenda continua DESENHADA.
   *
   * Era `cabines.filter((c) => c.ativo)`, e o 409 do `DELETE /cabines`
   * recomenda desativar (*"Desative-a se ela saiu de uso"*): as provas
   * marcadas continuavam no banco, continuavam AGENDADO, as noivas continuavam
   * recebendo a confirmação, e no dia **ninguém via que existiam** — a coluna
   * delas não era desenhada. A desativada e VAZIA continua fora, que é o ponto
   * de desativá-la.
   */
  const colunas = useMemo(() => colunasDaGrade(cabines, atendimentos), [cabines, atendimentos]);
  /** Para onde se PODE mover: a cabine inativa recebe o que já está nela, não o novo. */
  const cabinesAtivas = useMemo(() => cabines.filter((c) => c.ativo), [cabines]);

  /**
   * E136/E10 — reagendar SEM arrasto: os dois kanbans só ligavam
   * Pointer/Touch, e não havia formulário nenhum que editasse horário de
   * atendimento marcado — quem navega por teclado não reagendava NUNCA, e no
   * toque arrastar meia tela em 390px é pontaria. O diálogo SOMA ao arrasto
   * (que está bem — delay 200ms) sobre o MESMO PATCH.
   */
  const [reagendando, setReagendando] = useState<Atendimento | null>(null);
  const [reagHora, setReagHora] = useState("");
  const [reagCabineId, setReagCabineId] = useState("");
  function abrirReagendar(a: Atendimento) {
    // G15: o horário inicial cai na MALHA (14:17 → 14:00), que é o domínio das
    // opções agora. Fora do expediente não há slot para pré-selecionar — e é o
    // caso do órfão, que precisa mesmo escolher um horário novo.
    setReagHora(slotDe(a.inicio, expediente.aberturaHora, expediente.fechamentoHora) ?? "");
    setReagCabineId(a.cabineId);
    setReagendando(a);
  }
  /**
   * G15 (E168) — o diálogo passa pela MESMA recusa que o arraste.
   *
   * Ele montava o PATCH direto do `<input type="time">` e do `<Select>`: nem
   * `recusaDeMover`, nem célula apagada, nem `title` com o motivo. A doutrina
   * do E27 — recusar ANTES do gesto — estava invertida **justamente para quem
   * usa teclado e celular**, que é o público para o qual o diálogo nasceu
   * (E136/E10). Aqui a régua volta: horário e cabine vêm com o veredito, o que
   * está preso não é selecionável, e o botão não submete um destino recusado.
   */
  const opcoes = useMemo(
    () =>
      reagendando
        ? opcoesDeReagendamento({
            movida: reagendando,
            diaYMD,
            cabines: cabinesAtivas,
            atendimentosDoDia: atendimentos,
            expediente,
            ausencias,
            cabineEscolhida: reagCabineId,
            horaEscolhida: reagHora,
          })
        : null,
    [reagendando, diaYMD, cabinesAtivas, atendimentos, expediente, ausencias, reagCabineId, reagHora],
  );

  async function onReagendarPorDialogo() {
    if (!reagendando || !reagHora || !reagCabineId) return;
    // G15: o destino recusado não vira request — a mesma resposta que a grade
    // dá apagando a célula, dita em palavras para quem não arrasta.
    if (opcoes?.recusaDoPar) {
      toast({
        title: "Esse horário não está livre",
        description: DETALHE_RECUSA[opcoes.recusaDoPar],
        variant: "destructive",
      });
      return;
    }
    const inicio = instanteDoSlot(diaYMD, reagHora);
    try {
      await updateAtendimento.mutateAsync({
        lojaId: activeLojaId,
        atendimentoId: reagendando.id,
        data: { cabineId: reagCabineId, inicio: inicio.toISOString() },
      });
      await queryClient.invalidateQueries({ queryKey: getListAtendimentosQueryKey(activeLojaId) });
      const cabine = cabinesAtivas.find((c) => c.id === reagCabineId);
      toast({ title: `${nomePorLead.get(reagendando.leadId) ?? "Atendimento"} → ${cabine?.nome ?? "cabine"}, ${reagHora}` });
      setReagendando(null);
    } catch (err) {
      toast({ title: "Não deu para reagendar", description: mensagemApi(err, "Tente novamente."), variant: "destructive" });
    }
  }


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

  // E40: uma PROVA ocupa `provaDuracao` slots. Os slots seguintes ao de início,
  // na mesma cabine, ficam "cobertos" — mostram uma barra de continuação (e já
  // recusam drop pela sobreposição de intervalo do recusaDeMover).
  const coberturas = useMemo(() => {
    const mapa = new Map<string, Atendimento>();
    const dur = Math.max(1, expediente.provaDuracao ?? 1);
    if (dur <= 1) return mapa;
    for (const a of atendimentos) {
      if (a.tipo !== "PROVA") continue;
      const slot = slotDe(a.inicio, expediente.aberturaHora, expediente.fechamentoHora);
      if (!slot) continue;
      const idx = slots.indexOf(slot);
      for (let k = 1; k < dur; k++) {
        const s = slots[idx + k];
        if (!s) break;
        mapa.set(chaveCelula(a.cabineId, s), a);
      }
    }
    return mapa;
  }, [atendimentos, slots, expediente.aberturaHora, expediente.fechamentoHora, expediente.provaDuracao]);

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
        title: "Não deu para reagendar",
        description: mensagemApi(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  }

  if (colunas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma cabine ativa — a grade do dia precisa de ao menos uma.
      </p>
    );
  }

  return (
    <>
    <DndContext
      /* O drop é onde o PONTEIRO está — a colisão por retângulo (default)
         compara o card inteiro contra as células e fica no fio do meio
         quando a largura das colunas muda: o card pego pela alça esquerda
         se espalha para a direita e podia cair na cabine vizinha. */
      collisionDetection={pointerWithin}
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
            gridTemplateColumns: `4.5rem repeat(${colunas.length}, minmax(10rem, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-10 bg-background" />
          {colunas.map((cabine) => (
            <div
              key={cabine.id}
              className="border-b px-2 pb-2 text-center text-sm font-medium"
              data-testid={`coluna-agenda-${cabine.id}`}
            >
              {cabine.nome}
              {/* G6: a coluna que só existe porque tem gente marcada nela diz
                  isso — senão a desativação vira uma cabine que ninguém sabe
                  por que ainda aparece. */}
              {cabine.inativa && (
                <span className="block text-[10px] font-normal text-muted-foreground">
                  desativada — a agenda dela continua aqui
                </span>
              )}
            </div>
          ))}

          {slots.map((slot) => (
            <Fragment key={slot}>
              <div className="sticky left-0 z-10 border-t bg-background pr-2 pt-1 text-right text-xs tabular-nums text-muted-foreground">
                {slot}
              </div>
              {colunas.map((cabine) => (
                <Celula
                  key={`${cabine.id}:${slot}`}
                  cabineId={cabine.id}
                  slot={slot}
                  diaYMD={diaYMD}
                  ocupantes={porCelula.get(chaveCelula(cabine.id, slot)) ?? []}
                  cobertura={coberturas.get(chaveCelula(cabine.id, slot))}
                  arrastando={arrastando}
                  atendimentosDoDia={atendimentos}
                  expediente={expediente}
                  ausencias={ausencias}
                  // G6: nada NOVO entra numa cabine desativada — ela desenha o
                  // que já está lá para que a agenda não suma, e recusa o drop.
                  podeEditar={podeEditar && !cabine.inativa}
                  nomePorLead={nomePorLead}
                  onReagendar={abrirReagendar}
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
              {/* Era um Intl.DateTimeFormat construído DENTRO do .map() — um
                  formatador novo por órfão, com as mesmas opções de
                  `instanteHora`, a régua do relógio da loja. */}
              {instanteHora(a.inicio)}{" "}
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

    <Dialog open={!!reagendando} onOpenChange={(aberto) => !aberto && setReagendando(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Reagendar{reagendando ? ` — ${nomePorLead.get(reagendando.leadId) ?? "atendimento"}` : ""}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onReagendarPorDialogo();
          }}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="reag-hora">Horário (dia {diaYMD.slice(8, 10)}/{diaYMD.slice(5, 7)})</Label>
              {/* G15: era um `<input type=time>` livre. Vira a malha do
                  expediente com o veredito do núcleo em cada slot — o ocupado
                  aparece dito, não descoberto no submit. */}
              <Select value={reagHora} onValueChange={setReagHora}>
                <SelectTrigger id="reag-hora">
                  <SelectValue placeholder="Escolha o horário" />
                </SelectTrigger>
                <SelectContent>
                  {(opcoes?.horarios ?? []).map((o) => (
                    <SelectItem
                      key={o.valor}
                      value={o.valor}
                      disabled={!!o.recusa}
                      data-testid={`reag-hora-${o.valor}`}
                    >
                      {o.valor}
                      {o.detalhe ? ` — ${o.detalhe}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reag-cabine">Cabine</Label>
              <Select value={reagCabineId} onValueChange={setReagCabineId}>
                <SelectTrigger id="reag-cabine">
                  <SelectValue placeholder="Escolha a cabine" />
                </SelectTrigger>
                <SelectContent>
                  {(opcoes?.cabines ?? []).map((o) => (
                    <SelectItem
                      key={o.valor.id}
                      value={o.valor.id}
                      disabled={!!o.recusa}
                      data-testid={`reag-cabine-${o.valor.id}`}
                    >
                      {o.valor.nome}
                      {o.detalhe ? ` — ${o.detalhe}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {opcoes?.recusaDoPar && (
              <p className="text-destructive text-xs" data-testid="reag-recusa">
                {DETALHE_RECUSA[opcoes.recusaDoPar]}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setReagendando(null)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={updateAtendimento.isPending || !!opcoes?.recusaDoPar}
            >
              {updateAtendimento.isPending ? "Reagendando…" : "Reagendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

function Celula({
  cabineId,
  slot,
  diaYMD,
  ocupantes,
  cobertura,
  arrastando,
  atendimentosDoDia,
  expediente,
  ausencias,
  podeEditar,
  nomePorLead,
  onReagendar,
}: {
  cabineId: string;
  slot: string;
  diaYMD: string;
  ocupantes: Atendimento[];
  /** Prova que ocupa este slot como continuação (E40), quando não é o slot de início. */
  cobertura?: Atendimento;
  arrastando: Atendimento | null;
  atendimentosDoDia: Atendimento[];
  expediente: Expediente;
  ausencias: Ausencia[];
  podeEditar: boolean;
  nomePorLead: Map<string, string>;
  onReagendar: (a: Atendimento) => void;
}) {
  // A MESMA função que o PATCH consulta: a célula que o servidor recusaria não
  // aceita o card, em vez de aceitar e devolver 422 depois da animação.
  const recusa = arrastando
    ? recusaDeMover(
        arrastando,
        { cabineId, inicio: instanteDoSlot(diaYMD, slot) },
        atendimentosDoDia,
        expediente,
        ausencias,
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
      {ocupantes.length === 0 && cobertura && (
        <div
          className="rounded-md border border-dashed bg-muted/40 px-1.5 py-1 text-[10px] text-muted-foreground"
          data-testid={`cobertura-agenda-${cabineId}-${slot}`}
        >
          prova de {nomePorLead.get(cobertura.leadId) ?? "noiva"}
        </div>
      )}
      {ocupantes.map((a) => (
        <CartaoAtendimento
          key={a.id}
          atendimento={a}
          nome={nomePorLead.get(a.leadId) ?? "Noiva"}
          arrastavel={podeEditar}
          escondido={arrastando?.id === a.id}
          onReagendar={onReagendar}
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
  onReagendar,
}: {
  atendimento: Atendimento;
  nome: string;
  arrastavel: boolean;
  escondido?: boolean;
  /** E136/E10: a porta sem arrasto — soma ao drag, não o substitui. */
  onReagendar?: (a: Atendimento) => void;
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
        {arrastavel && onReagendar && (
          <button
            type="button"
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Reagendar atendimento de ${nome}`}
            data-testid={`reagendar-${atendimento.id}`}
            onClick={() => onReagendar(atendimento)}
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Badge variant="secondary" className="px-1 py-0 text-[10px] font-normal">
          {atendimento.tipo === "PROVA" ? "Prova" : "Atend."}
        </Badge>
        <span className="truncate text-[10px] text-muted-foreground">
          {SITUACAO_LABELS[atendimento.situacao] ?? atendimento.situacao}
        </span>
        {/* S-O5: a prova cujo vestido saiu da noiva. Aqui é o card mais
            apertado do app, então o selo entra compacto — e é a tela que a
            loja lê o dia inteiro, então é a que mais precisa dele. */}
        <SeloProvaOrfa atendimento={atendimento} compacto />
      </div>
    </div>
  );
}
