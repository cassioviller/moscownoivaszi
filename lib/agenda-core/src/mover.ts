import {
  dentroDoFuncionamento,
  diaDaSemanaLocal,
  diaLocalYMD,
  horaLocal,
  instanteDoSlot,
  slotsDoDia,
  SLOT_MINUTOS,
} from "./slots";

/**
 * A regra de "esse atendimento pode ir para ali?", em UM lugar.
 *
 * Antes ela não existia em lugar nenhum inteiro: o horário de funcionamento era
 * conferido só no formulário do cliente, e o choque de agenda só pelas UNIQUE do
 * banco — que devolvem um 409 genérico sem dizer se esbarrou na cabine ou na
 * vendedora. A grade precisa saber ANTES do gesto, para apagar a célula em vez
 * de aceitar o card e falhar depois (doutrina do E27).
 *
 * A rota usa isto como pré-checagem amigável, não como garantia: entre o SELECT
 * e o UPDATE cabe outra requisição. Quem realmente segura é a UNIQUE do banco —
 * o mesmo desenho que o E1 provou sob `Promise.all`.
 */

export type MotivoRecusa =
  | "LOJA_FECHADA"
  | "FORA_DO_HORARIO"
  | "VENDEDORA_AUSENTE"
  | "CABINE_OCUPADA"
  | "VENDEDORA_OCUPADA";

export const DETALHE_RECUSA: Record<MotivoRecusa, string> = {
  LOJA_FECHADA: "a loja não abre nesse dia da semana",
  FORA_DO_HORARIO: "o horário está fora do expediente da loja",
  // E151: a rota substitui esta frase por uma que diz QUEM e QUANDO — aqui
  // fica a genérica, porque o núcleo puro não conhece nomes.
  VENDEDORA_AUSENTE: "a vendedora está ausente nesse dia",
  CABINE_OCUPADA: "já há atendimento nessa cabine nesse horário",
  VENDEDORA_OCUPADA: "a vendedora já tem atendimento nesse horário",
};

/**
 * E151 — um período em que alguém da equipe não atende.
 *
 * Dias locais inclusivos nas duas pontas: quem digita 10/07 a 20/07 está
 * dizendo que no dia 20 ainda não voltou. É o formato que o `date` do banco já
 * devolve, e o que a comparação de string "YYYY-MM-DD" ordena corretamente.
 */
export type Ausencia = {
  usuarioId: string;
  /** Dia local "YYYY-MM-DD", inclusivo. */
  inicio: string;
  /** Dia local "YYYY-MM-DD", inclusivo. */
  fim: string;
};

/** O mínimo que a regra precisa saber — a linha do drizzle e o objeto da API entram igual. */
export type Marcacao = {
  id: string;
  cabineId: string;
  vendedoraId: string;
  inicio: Date | string;
  // Uma PROVA ocupa `provaDuracao` slots; qualquer outra, um só (E40). Ausente =
  // tratada como 1 slot, o comportamento de antes.
  tipo?: "ATENDIMENTO" | "PROVA";
};

export type Expediente = {
  aberturaHora: number;
  fechamentoHora: number;
  dias?: number[];
  /** Duração da PROVA em slots de 30 min (E40). Ausente = 1 slot. */
  provaDuracao?: number;
};

const SLOT_MS = SLOT_MINUTOS * 60_000;

/** Slots que a marcação ocupa: PROVA ocupa `provaDuracao`, o resto ocupa 1. */
function duracaoSlots(m: Marcacao, provaDuracao?: number): number {
  return m.tipo === "PROVA" ? Math.max(1, provaDuracao ?? 1) : 1;
}

/** Duração da marcação em milissegundos: PROVA ocupa `provaDuracao` slots. */
function duracaoMs(m: Marcacao, provaDuracao?: number): number {
  return duracaoSlots(m, provaDuracao) * SLOT_MS;
}

/** Dois intervalos [iniA,fimA) e [iniB,fimB) se cruzam? */
function sobrepoe(iniA: number, fimA: number, iniB: number, fimB: number): boolean {
  return iniA < fimB && iniB < fimA;
}

/**
 * Expediente de quem ainda não configurou nada. Espelha os defaults das colunas
 * de `regra_disponibilidade` do schema — uma loja sem linha lá precisa de
 * agenda mesmo assim.
 *
 * S-M13 — o espelho ficou em 19h quando a S-A8 levou o schema para 20h, e não
 * carregava `dias` nem `provaDuracao`: a loja recém-criada perdia 19:00 e
 * 19:30 da grade, e a prova das 18:30 passava como se durasse 30 min. Um
 * espelho sem prova é uma frase (regra 30) — a equivalência agora é pregada
 * campo a campo contra o schema no teste do E147, junto com a do
 * `HORARIO_PADRAO`, que é a outra cópia da mesma régua.
 */
export const EXPEDIENTE_PADRAO: Expediente = {
  aberturaHora: 9,
  fechamentoHora: 20,
  dias: [0, 1, 2, 3, 4, 5, 6],
  provaDuracao: 2,
};

const instante = (v: Date | string): number => new Date(v).getTime();

/**
 * A ausência desta pessoa que cobre o dia do instante — `null` se não há.
 *
 * A comparação é de STRING "YYYY-MM-DD", que ordena como data, no dia LOCAL da
 * loja: comparar instantes traria de volta o defeito que o fuso já custou caro
 * aqui — 21h de 09/07 em UTC é dia 10 em São Paulo, e a vendedora seria
 * recusada num dia em que está trabalhando (ou aceita no dia em que não está).
 */
export function ausenciaQueCobre(
  ausencias: readonly Ausencia[],
  usuarioId: string,
  instanteDestino: Date | string,
): Ausencia | null {
  if (ausencias.length === 0) return null;
  const dia = diaLocalYMD(instanteDestino);
  return (
    ausencias.find((a) => a.usuarioId === usuarioId && a.inicio <= dia && dia <= a.fim) ?? null
  );
}

/**
 * Por que este movimento seria recusado — `null` se é permitido.
 *
 * `outras` é a agenda com que o destino compete; o próprio atendimento movido é
 * ignorado por id, senão ele colidiria consigo mesmo ao ser solto de volta no
 * lugar onde já está.
 */
export function recusaDeMover(
  movida: Marcacao,
  destino: { cabineId: string; inicio: Date | string },
  outras: readonly Marcacao[],
  expediente: Expediente,
  /**
   * E151 — as ausências da equipe que tocam este dia. Ausente (ou vazio) = a
   * régua de antes, que não sabia que gente falta.
   */
  ausencias: readonly Ausencia[] = [],
): MotivoRecusa | null {
  // E38: a loja pode não abrir nesse dia da semana — distinto de fora do horário.
  if (expediente.dias && !expediente.dias.includes(diaDaSemanaLocal(destino.inicio))) {
    return "LOJA_FECHADA";
  }
  if (!dentroDoFuncionamento(destino.inicio, expediente.aberturaHora, expediente.fechamentoHora)) {
    return "FORA_DO_HORARIO";
  }
  /**
   * E151 — a pessoa falta nesse dia.
   *
   * Vem logo depois do expediente e ANTES da ocupação porque é da mesma
   * natureza: um fato sobre o DIA, não sobre quem já está marcado. A agenda de
   * uma vendedora em férias está vazia — dizer "livre" nela é o defeito.
   *
   * Só impede o NOVO: a ausência não cancela nem remarca o que já está
   * agendado (fora do escopo do épico, e decisão de produto). Por isso a
   * conferência olha o DESTINO, e não a agenda existente.
   */
  if (ausenciaQueCobre(ausencias, movida.vendedoraId, destino.inicio)) {
    return "VENDEDORA_AUSENTE";
  }
  /**
   * E o FIM também tem de caber no expediente.
   *
   * Só o início era conferido, e uma PROVA ocupa `provaDuracao` slots: com
   * prova de 90 min e fechamento às 19h, `slotsDoDia` produz 18:30, esta função
   * aprovava (18 < 19) e a grade OFERECIA o slot. A prova ficava marcada das
   * 18:30 às 20:00 — uma hora depois de a loja fechar —, e a noiva recebia a
   * confirmação por WhatsApp de um horário em que não há ninguém na loja. A
   * mesma conta (`duracaoSlots`) já era usada para bloquear as cabines
   * vizinhas; só o expediente não era consultado.
   *
   * A conta é em minutos do dia LOCAL, e não sobre o instante do fim, porque é
   * o relógio da loja que define o fechamento — a mesma régua de
   * `dentroDoFuncionamento`.
   */
  const { hora, minuto } = horaLocal(destino.inicio);
  const fimEmMinutos =
    hora * 60 + minuto + duracaoSlots(movida, expediente.provaDuracao) * SLOT_MINUTOS;
  if (fimEmMinutos > expediente.fechamentoHora * 60) {
    return "FORA_DO_HORARIO";
  }

  // E40: conflito por SOBREPOSIÇÃO de intervalo, não só de instante — uma prova
  // que ocupa dois slots bloqueia o slot seguinte na mesma cabine. As UNIQUE do
  // banco ainda são a garantia do instante exato; isto é a pré-checagem que a
  // grade e a rota usam para não oferecer um destino que colide com a prova.
  const iniMovida = instante(destino.inicio);
  const fimMovida = iniMovida + duracaoMs(movida, expediente.provaDuracao);
  for (const outra of outras) {
    if (outra.id === movida.id) continue;
    const iniOutra = instante(outra.inicio);
    const fimOutra = iniOutra + duracaoMs(outra, expediente.provaDuracao);
    if (!sobrepoe(iniMovida, fimMovida, iniOutra, fimOutra)) continue;
    if (outra.cabineId === destino.cabineId) return "CABINE_OCUPADA";
    if (outra.vendedoraId === movida.vendedoraId) return "VENDEDORA_OCUPADA";
  }

  return null;
}

export type SlotOferecido = {
  /** "HH:MM" no fuso da loja. */
  slot: string;
  /** O instante em que o slot começa. */
  inicio: Date;
  /** Por que este slot não pode — null quando está livre. */
  recusa: MotivoRecusa | null;
};

/**
 * E64: a agenda passa a OFERECER, não só recusar.
 *
 * O formulário de agendamento usava um input de hora livre e o conflito só
 * aparecia como erro da API depois do submit. Aqui a mesma régua de
 * `recusaDeMover` percorre a malha do dia e devolve cada slot com o veredito —
 * a tela mostra o que está livre e a vendedora clica, em vez de adivinhar.
 */
export function slotsOferecidos(
  diaYMD: string,
  candidata: { cabineId: string; vendedoraId: string; tipo?: "ATENDIMENTO" | "PROVA" },
  outras: readonly Marcacao[],
  expediente: Expediente,
  /** E151 — sem elas a tela ofereceria o dia inteiro de quem está de férias. */
  ausencias: readonly Ausencia[] = [],
): SlotOferecido[] {
  return slotsDoDia(expediente.aberturaHora, expediente.fechamentoHora).map((slot) => {
    const inicio = instanteDoSlot(diaYMD, slot);
    const recusa = recusaDeMover(
      { id: "__nova__", cabineId: candidata.cabineId, vendedoraId: candidata.vendedoraId, tipo: candidata.tipo, inicio },
      { cabineId: candidata.cabineId, inicio },
      outras,
      expediente,
      ausencias,
    );
    return { slot, inicio, recusa };
  });
}
