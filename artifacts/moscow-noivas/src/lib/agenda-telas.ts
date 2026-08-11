/**
 * E168 — o que as TRÊS telas de agenda precisam decidir igual, decidido aqui.
 *
 * A régua de "pode marcar ali?" mora em `@workspace/agenda-core` e continua
 * lá. O que este módulo guarda é o degrau acima dela: **quais colunas a grade
 * desenha**, **que semana o botão "Esta semana" abre** e **quais opções o
 * diálogo de reagendar oferece** — três decisões que estavam escritas dentro
 * de `grade.tsx` e `semana.tsx`, cada uma de um jeito, e que nenhuma suíte
 * enxergava.
 */
import {
  DETALHE_RECUSA,
  instanteDoSlot,
  recusaDeMover,
  slotsDoDia,
  type Ausencia,
  type Expediente,
  type Marcacao,
  type MotivoRecusa,
} from "./agenda";
import { diaLocal } from "./financeiro/datas";

/** O mínimo que estas decisões precisam saber de uma cabine. */
export type CabineDaGrade = { id: string; nome: string; ativo?: boolean | null };

/** A coluna que a grade desenha: a cabine, mais o aviso de que ela saiu de uso. */
export type ColunaDaGrade = CabineDaGrade & { inativa: boolean };

/**
 * G6 (E168) — a cabine desativada continua DESENHADA enquanto tiver agenda.
 *
 * As duas telas filtravam `cabines.filter((c) => c.ativo)` (`grade.tsx:119` e
 * `semana.tsx:104`), e o 409 do `DELETE /cabines` **recomenda exatamente
 * desativar**: *"Desative-a se ela saiu de uso"*. O resultado é a perda mais
 * silenciosa da agenda — as provas marcadas continuam no banco, continuam
 * AGENDADO, as noivas continuam recebendo a confirmação por WhatsApp, e **no
 * dia ninguém vê que existem**: a coluna delas não é desenhada.
 *
 * A cabine desativada e VAZIA continua fora, que é o ponto de desativá-la:
 * ela some da grade para não ser oferecida. O que volta é só a que ainda tem
 * gente marcada, e volta marcada como inativa — não se arrasta nada para
 * dentro dela (o `podeEditar` da célula continua mandando), mas o que já está
 * lá aparece.
 */
export function colunasDaGrade(
  cabines: readonly CabineDaGrade[],
  atendimentos: readonly { cabineId: string }[],
): ColunaDaGrade[] {
  const comAgenda = new Set(atendimentos.map((a) => a.cabineId));
  return cabines
    .filter((c) => c.ativo || comAgenda.has(c.id))
    .map((c) => ({ ...c, inativa: !c.ativo }));
}

/**
 * G6 — quantos atendimentos ficam na cabine que está sendo desativada.
 *
 * Desativar é a saída que o próprio 409 do DELETE recomenda, e até aqui ela
 * era silenciosa nos dois sentidos: a agenda sumia da tela e ninguém dizia
 * quanta agenda era.
 */
export function atendimentosNaCabine(
  atendimentos: readonly { cabineId: string }[],
  cabineId: string,
): number {
  return atendimentos.filter((a) => a.cabineId === cabineId).length;
}

/**
 * G11 (E168) — a semana nasce do dia da LOJA, como a tela do dia.
 *
 * `semana.tsx:48` chamava `startOfWeek(new Date())`, e `new Date()` lido por
 * `date-fns` é o relógio do NAVEGADOR. O recorte dos atendimentos, três linhas
 * abaixo, já era pelo dia da loja (`diaLocal`, E115): as duas pontas da mesma
 * tela discordavam sobre que dia é hoje.
 *
 * **Medido:** navegador em UTC às 02:00 de segunda-feira = 23:00 de domingo em
 * São Paulo. `startOfWeek` responde a segunda que está começando, `diaLocal`
 * responde o domingo que ainda não acabou — e o botão "Esta semana" leva à
 * semana SEGUINTE, com a semana corrente inteira fora da busca. É a fronteira
 * que sobrou da S-M25.
 *
 * A conta é feita sobre a string "YYYY-MM-DD", não sobre um `Date`: é a única
 * forma de o fuso do navegador não voltar pela porta dos fundos.
 */
export function segundaDaSemana(diaYMD: string): string {
  const [ano, mes, dia] = diaYMD.split("-").map(Number);
  // Meio-dia UTC: âncora sem borda: somar ou subtrair dias nunca vira o dia.
  const d = new Date(Date.UTC(ano!, mes! - 1, dia!, 12));
  // getUTCDay: 0=domingo. A semana começa na segunda, então domingo recua 6.
  const recuo = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - recuo);
  return d.toISOString().slice(0, 10);
}

/**
 * A âncora da semana visível: o parâmetro da URL quando ele existe e é uma
 * data legível, o dia da LOJA quando não.
 */
export function ancoraDaSemana(param: string | null, agora: Date): string {
  const base = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : diaLocal(agora);
  return segundaDaSemana(base);
}

/** Os sete dias "YYYY-MM-DD" da semana que começa na segunda dada. */
export function diasDaSemana(segundaYMD: string): string[] {
  const [ano, mes, dia] = segundaYMD.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(ano!, mes! - 1, dia! + i, 12));
    return d.toISOString().slice(0, 10);
  });
}

export type OpcaoDeReagendamento<T> = {
  valor: T;
  /** Por que este destino não pode — `null` quando está livre. */
  recusa: MotivoRecusa | null;
  /** A frase da recusa, pronta para o `title`/rótulo. `null` quando livre. */
  detalhe: string | null;
};

/**
 * G15 (E168) — o diálogo de reagendar passa pela MESMA recusa que o arraste.
 *
 * `grade.tsx:137` montava o PATCH direto do `<input type="time">` e do
 * `<Select>` de cabine: nem `recusaDeMover`, nem a célula apagada, nem o
 * `title` com o motivo. A doutrina do E27 — recusar ANTES do gesto, não depois
 * da animação — estava invertida **justamente para quem usa teclado e celular**,
 * que é o público para o qual o diálogo foi criado (E136/E10).
 *
 * Devolve as duas listas já avaliadas: os horários do expediente e as cabines,
 * cada um com o veredito do núcleo. A tela desabilita o que está preso e diz
 * por quê, em vez de deixar o servidor responder 422 depois do submit.
 */
export function opcoesDeReagendamento({
  movida,
  diaYMD,
  cabines,
  atendimentosDoDia,
  expediente,
  ausencias,
  cabineEscolhida,
  horaEscolhida,
}: {
  movida: Marcacao;
  diaYMD: string;
  cabines: readonly CabineDaGrade[];
  atendimentosDoDia: readonly Marcacao[];
  expediente: Expediente;
  ausencias: readonly Ausencia[];
  /** A cabine selecionada no diálogo — os horários são avaliados contra ela. */
  cabineEscolhida: string;
  /** O horário selecionado — as cabines são avaliadas contra ele. */
  horaEscolhida: string;
}): {
  horarios: OpcaoDeReagendamento<string>[];
  cabines: OpcaoDeReagendamento<CabineDaGrade>[];
  /** A recusa do par escolhido — o que trava o botão "Reagendar". */
  recusaDoPar: MotivoRecusa | null;
} {
  const avaliar = (cabineId: string, hora: string): MotivoRecusa | null => {
    if (!cabineId || !hora) return null;
    const inicio = instanteDoSlot(diaYMD, hora);
    return recusaDeMover(movida, { cabineId, inicio }, atendimentosDoDia, expediente, ausencias);
  };
  const comDetalhe = <T,>(valor: T, recusa: MotivoRecusa | null): OpcaoDeReagendamento<T> => ({
    valor,
    recusa,
    detalhe: recusa ? DETALHE_RECUSA[recusa] : null,
  });

  return {
    horarios: slotsDoDia(expediente.aberturaHora, expediente.fechamentoHora).map((slot) =>
      comDetalhe(slot, avaliar(cabineEscolhida, slot)),
    ),
    cabines: cabines.map((c) => comDetalhe(c, avaliar(c.id, horaEscolhida))),
    recusaDoPar: avaliar(cabineEscolhida, horaEscolhida),
  };
}
