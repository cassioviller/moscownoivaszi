/** Helpers de formatação/negócio compartilhados pelas páginas. */

export const ETAPA_LABELS: Record<string, string> = {
  NOVO: "Novo",
  INTERESSES_PREENCHIDOS: "Interesses preenchidos",
  ATENDIMENTO_AGENDADO: "Atendimento agendado",
  EM_ATENDIMENTO: "Em atendimento",
  ORCAMENTO_ABERTO: "Orçamento aberto",
  CONTRATO_FECHADO: "Contrato fechado",
  EM_PROVAS: "Em provas",
  RETIRADO: "Retirado",
  CASAMENTO_REALIZADO: "Casamento realizado",
  DEVOLVIDO: "Devolvido",
  PERDIDO: "Perdido",
};

export function etapaLabel(etapa: string): string {
  return ETAPA_LABELS[etapa] ?? etapa;
}

export function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

/**
 * Converte "YYYY-MM-DD" (input type=date) para ISO ancorado ao meio-dia de
 * São Paulo — evita que a data escorregue de dia ao ser coagida em UTC.
 */
export function diaParaISO(dia: string): string {
  return new Date(`${dia}T12:00:00-03:00`).toISOString();
}
