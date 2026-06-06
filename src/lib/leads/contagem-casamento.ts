// src/lib/leads/contagem-casamento.ts
// Contagem regressiva até o casamento. Base meia-noite UTC do dia-calendário em
// São Paulo (convenção do sistema — @/lib/tempo) p/ evitar off-by-one. Puro/
// testável: o "hoje" entra como ms (default = hoje SP). Mesma janela de urgência
// (≤14d) do dashboard/perfil/ajustes/reservas/calendário.
import { hojeUTC } from "@/lib/tempo";

export const JANELA_URGENCIA_DIAS = 14;
const DIA_MS = 86_400_000;

/** Dias-calendário até o casamento (negativo = já passou). `hojeMs` deve ser a
 *  meia-noite UTC do dia de referência; o default usa o dia de hoje em SP. */
export function diasAteCasamento(casamentoData: Date, hojeMs: number = hojeUTC().getTime()): number {
  return Math.round((casamentoData.getTime() - hojeMs) / DIA_MS);
}

/** Rótulo humano p/ contagem no presente/futuro: "É hoje" | "Amanhã" | "Em N dias". */
export function rotuloContagem(dias: number): string {
  if (dias === 0) return "É hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias} dias`;
}

/** Urgência concierge: casamento ainda por vir, dentro da janela. */
export function casamentoUrgente(dias: number): boolean {
  return dias >= 0 && dias <= JANELA_URGENCIA_DIAS;
}

/** Prazo do casamento na voz de uma fila de trabalho (prova/ajuste): pode estar
 *  atrasado. "casamento passou" | "casamento hoje" | "casamento amanhã" |
 *  "casamento em N dias". Usado na aba Provas & ajustes e na fila de Ajustes. */
export function prazoCasamento(dias: number): string {
  if (dias < 0) return "casamento passou";
  if (dias === 0) return "casamento hoje";
  if (dias === 1) return "casamento amanhã";
  return `casamento em ${dias} dias`;
}
