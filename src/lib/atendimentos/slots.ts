// src/lib/atendimentos/slots.ts
// Grade de horários do dia (função pura, sem Prisma). Slots de 1h, duração fixa.
// Um slot na hora H fica "ocupado" se H está em `horasOcupadas` (horas em que a
// cabine OU a vendedora escolhidas já têm atendimento naquele dia).
export const DURACAO_MIN = 60;

export type Slot = { hora: number; livre: boolean };

export function gradeDeSlots(
  aberturaHora: number,
  fechamentoHora: number,
  horasOcupadas: number[],
): Slot[] {
  const ocupadas = new Set(horasOcupadas);
  const slots: Slot[] = [];
  for (let h = aberturaHora; h < fechamentoHora; h++) {
    slots.push({ hora: h, livre: !ocupadas.has(h) });
  }
  return slots;
}

// "14" → "14:00". Apresentação consistente (hora cheia em UTC).
export function rotuloHora(hora: number): string {
  return `${String(hora).padStart(2, "0")}:00`;
}

// rótulo de um slot: "14:00 – 15:00"
export function rotuloSlot(hora: number): string {
  return `${rotuloHora(hora)} – ${rotuloHora(hora + 1)}`;
}
