/**
 * A malha de horários da agenda. Puro: sem IO, sem banco.
 *
 * Fuso da loja: America/Sao_Paulo, offset fixo -03:00 (sem DST desde 2019 — a
 * mesma premissa de `disponibilidade.ts` e de `@workspace/financeiro-core`).
 * Um atendimento é um INSTANTE, e a hora dele só existe num fuso: lido em UTC,
 * um horário das 18h vira 21h e cai fora do expediente sem que ninguém entenda
 * por quê.
 */

const FUSO_LOJA = "America/Sao_Paulo";

/**
 * Passo da grade. A tabela não guarda duração (só `inicio`), então a malha é
 * uma convenção da tela, não do domínio — daí ser constante e não configuração.
 */
export const SLOT_MINUTOS = 30;

const formatadorHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_LOJA,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Hora e minuto de um instante no fuso da loja. */
export function horaLocal(instante: Date | string): { hora: number; minuto: number } {
  const [h, m] = formatadorHora.format(new Date(instante)).split(":");
  return { hora: Number(h), minuto: Number(m) };
}

const formatadorDia = new Intl.DateTimeFormat("en-US", { timeZone: FUSO_LOJA, weekday: "short" });
const NUM_DIA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Dia da semana de um instante no fuso da loja: 0=domingo … 6=sábado. */
export function diaDaSemanaLocal(instante: Date | string): number {
  return NUM_DIA[formatadorDia.format(new Date(instante))] ?? 0;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" de um par hora/minuto. */
export function rotuloSlot(hora: number, minuto: number): string {
  return `${doisDigitos(hora)}:${doisDigitos(minuto)}`;
}

/**
 * Os slots de um dia de expediente, do primeiro ao último que ainda COMEÇA
 * dentro dele. Fechamento às 19h significa que 18:30 é o último slot — às 19h
 * a loja fecha, não inicia atendimento. É a mesma régua que o formulário de
 * novo atendimento já aplicava sozinho no cliente.
 */
export function slotsDoDia(aberturaHora: number, fechamentoHora: number): string[] {
  if (!(fechamentoHora > aberturaHora)) return [];
  const slots: string[] = [];
  const passos = ((fechamentoHora - aberturaHora) * 60) / SLOT_MINUTOS;
  for (let i = 0; i < passos; i++) {
    const minutos = aberturaHora * 60 + i * SLOT_MINUTOS;
    slots.push(rotuloSlot(Math.floor(minutos / 60), minutos % 60));
  }
  return slots;
}

/** O instante em que um slot começa, num dia "YYYY-MM-DD" do fuso da loja. */
export function instanteDoSlot(diaYMD: string, slot: string): Date {
  return new Date(`${diaYMD}T${slot}:00-03:00`);
}

export function dentroDoFuncionamento(
  instante: Date | string,
  aberturaHora: number,
  fechamentoHora: number,
  // Dias em que a loja abre (E38). Ausente = sem restrição de dia (loja sem
  // regra configurada); presente e sem o dia do instante = fechada nesse dia.
  dias?: number[],
): boolean {
  if (dias && !dias.includes(diaDaSemanaLocal(instante))) return false;
  const { hora } = horaLocal(instante);
  return hora >= aberturaHora && hora < fechamentoHora;
}

/**
 * O slot que CONTÉM este instante, com piso na malha — 14:17 cai em 14:00.
 *
 * O piso não é conveniência: a tela de criação usa `datetime-local` livre, então
 * o banco já tem atendimentos fora da malha. Sem piso eles não teriam célula e
 * sumiriam da grade — um atendimento invisível é pior do que um deslocado.
 * Fora do expediente devolve `null`: aí não há célula onde desenhar.
 */
export function slotDe(
  instante: Date | string,
  aberturaHora: number,
  fechamentoHora: number,
): string | null {
  if (!dentroDoFuncionamento(instante, aberturaHora, fechamentoHora)) return null;
  const { hora, minuto } = horaLocal(instante);
  return rotuloSlot(hora, Math.floor(minuto / SLOT_MINUTOS) * SLOT_MINUTOS);
}

/**
 * Chave da célula da grade. O droppable do dnd-kit carrega um id string só, e
 * a célula é um par (cabine, slot) — daí serializar e destrinchar.
 */
export function chaveCelula(cabineId: string, slot: string): string {
  return `${cabineId}|${slot}`;
}

export function lerChaveCelula(chave: string): { cabineId: string; slot: string } | null {
  const corte = chave.lastIndexOf("|");
  if (corte <= 0 || corte === chave.length - 1) return null;
  return { cabineId: chave.slice(0, corte), slot: chave.slice(corte + 1) };
}

const formatadorDiaYMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_LOJA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Dia local "YYYY-MM-DD" de um instante (E151).
 *
 * en-CA formata exatamente nesse formato — a mesma escolha de
 * `disponibilidade.ts`, e pelo mesmo motivo: é a única forma de comparar dias
 * sem que o fuso mude a resposta. 21h de 09/07 em UTC é dia 10 em São Paulo.
 */
export function diaLocalYMD(instante: Date | string): string {
  return formatadorDiaYMD.format(new Date(instante));
}
