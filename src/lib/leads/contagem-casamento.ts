// src/lib/leads/contagem-casamento.ts
// Contagem regressiva até o casamento. Base UTC (a data nasce em meia-noite UTC em
// leads.ts) — evita off-by-one. Puro/testável: o "hoje" entra como parâmetro.
// Mesma janela de urgência (≤14d) do dashboard/perfil/ajustes/reservas/calendário.
export const JANELA_URGENCIA_DIAS = 14;
const DIA_MS = 86_400_000;

/** Meia-noite UTC de uma data, em ms (referência da contagem). */
export function hojeUTCms(agora: Date = new Date()): number {
  return Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
}

/** Dias até o casamento (negativo = já passou). */
export function diasAteCasamento(casamentoData: Date, agora: Date = new Date()): number {
  return Math.round((casamentoData.getTime() - hojeUTCms(agora)) / DIA_MS);
}

/** Rótulo humano para uma contagem no presente/futuro: "É hoje" | "Amanhã" | "Em N dias". */
export function rotuloContagem(dias: number): string {
  if (dias === 0) return "É hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias} dias`;
}

/** Urgência concierge: casamento ainda por vir, dentro da janela (não insiste no passado). */
export function casamentoUrgente(dias: number): boolean {
  return dias >= 0 && dias <= JANELA_URGENCIA_DIAS;
}
