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

// Status em linguagem de gente. Fallback devolve o valor cru: um status novo
// no backend aparece feio, mas aparece — nunca some.
const STATUS_ORCAMENTO_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
};

export function statusOrcamentoLabel(status: string): string {
  return STATUS_ORCAMENTO_LABELS[status] ?? status;
}

const STATUS_CONTRATO_LABELS: Record<string, string> = {
  ATIVO: "Ativo",
  CANCELADO: "Cancelado",
};

export function statusContratoLabel(status: string): string {
  return STATUS_CONTRATO_LABELS[status] ?? status;
}

const TIPO_ATRIBUTO_LABELS: Record<string, string> = {
  ESCALA: "escala",
  OPCAO_UNICA: "opção única",
};

export function tipoAtributoLabel(tipo: string): string {
  return TIPO_ATRIBUTO_LABELS[tipo] ?? tipo;
}

// Por que a noiva não fechou — espelha o enum lead_perdida_motivo do backend.
export const PERDIDA_MOTIVO_LABELS: Record<string, string> = {
  PRECO: "Preço",
  DATA_INDISPONIVEL: "Data indisponível",
  CONCORRENTE: "Fechou com concorrente",
  DESISTENCIA: "Desistiu do aluguel",
  SEM_RETORNO: "Parou de responder",
  OUTRO: "Outro",
};

export function perdidaMotivoLabel(motivo: string): string {
  return PERDIDA_MOTIVO_LABELS[motivo] ?? motivo;
}

// De onde a noiva veio — espelha o enum lead_origem do backend (E19).
export const ROTULO_ORIGEM: Record<string, string> = {
  LOJA: "Loja",
  WHATSAPP: "WhatsApp",
  SITE: "Site",
  INSTAGRAM: "Instagram",
};

export function origemLabel(origem: string): string {
  return ROTULO_ORIGEM[origem] ?? origem;
}

const dataDiaFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

/**
 * Formata uma data de NEGÓCIO (casamento, vencimento) sem deixar o fuso
 * empurrar o dia: `toLocaleDateString("pt-BR")` sem timeZone lê meia-noite UTC
 * no fuso local e mostra a véspera. Date-only ("2026-11-20") é normalizado ao
 * meio-dia UTC antes de formatar.
 */
export function dataDia(iso: string): string {
  const soDia = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return dataDiaFmt.format(new Date(soDia ? `${iso}T12:00:00Z` : iso));
}

export function brl(valor: number): string {
  // maximumFractionDigits é obrigatório: sem ele, um valor com >2 casas (rateio
  // de parcela, base de desconto) renderiza "R$ 1.234,567" numa tela de dinheiro.
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Converte "YYYY-MM-DD" (input type=date) para ISO ancorado ao meio-dia de
 * São Paulo — evita que a data escorregue de dia ao ser coagida em UTC.
 */
export function diaParaISO(dia: string): string {
  return new Date(`${dia}T12:00:00-03:00`).toISOString();
}
