import type { Lead, Orcamento, Reserva } from "@workspace/db";

/**
 * Máquina de estados do domínio. Funções puras (sem IO): validam se uma
 * transição é permitida, não o estado atual (dados legados podem estar em
 * qualquer estado). As rotas rejeitam transições inválidas com 422.
 */

export type LeadEtapa = Lead["etapa"];
export type OrcamentoStatus = Orcamento["status"];
export type ReservaStatus = Reserva["status"];

// ───────────────────────── Lead ─────────────────────────

// Funil linear da noiva. PERDIDO fica fora do funil (estado lateral).
export const FUNIL_LEAD: LeadEtapa[] = [
  "NOVO",
  "INTERESSES_PREENCHIDOS",
  "ATENDIMENTO_AGENDADO",
  "EM_ATENDIMENTO",
  "ORCAMENTO_ABERTO",
  "CONTRATO_FECHADO",
  "EM_PROVAS",
  "RETIRADO",
  "CASAMENTO_REALIZADO",
  "DEVOLVIDO",
];

/**
 * Transição de etapa permitida: avança no funil (nunca regride), sempre pode
 * marcar como PERDIDO, e um lead PERDIDO pode ser revivido para qualquer etapa
 * do funil. Manter no mesmo estado é sempre válido (no-op).
 */
export function transicaoLeadValida(de: LeadEtapa, para: LeadEtapa): boolean {
  if (de === para) return true;
  if (para === "PERDIDO") return true;
  if (de === "PERDIDO") return FUNIL_LEAD.includes(para);
  const iDe = FUNIL_LEAD.indexOf(de);
  const iPara = FUNIL_LEAD.indexOf(para);
  return iDe !== -1 && iPara !== -1 && iPara > iDe;
}

/**
 * Avanço automático (efeito colateral de um evento): move a etapa até `alvo`
 * apenas se for à frente no funil. Nunca regride e nunca mexe num lead fora do
 * funil (ex.: PERDIDO permanece PERDIDO). Retorna a etapa resultante.
 */
export function avancarEtapaLead(atual: LeadEtapa, alvo: LeadEtapa): LeadEtapa {
  const iAtual = FUNIL_LEAD.indexOf(atual);
  const iAlvo = FUNIL_LEAD.indexOf(alvo);
  if (iAtual === -1 || iAlvo === -1) return atual;
  return iAlvo > iAtual ? alvo : atual;
}

// ───────────────────────── Orçamento ─────────────────────────

export const TRANSICOES_ORCAMENTO: Record<OrcamentoStatus, OrcamentoStatus[]> = {
  RASCUNHO: ["ENVIADO", "APROVADO", "RECUSADO"],
  ENVIADO: ["APROVADO", "RECUSADO"],
  APROVADO: [],
  RECUSADO: [],
};

export function transicaoOrcamentoValida(de: OrcamentoStatus, para: OrcamentoStatus): boolean {
  if (de === para) return true;
  return TRANSICOES_ORCAMENTO[de].includes(para);
}

// ───────────────────────── Reserva ─────────────────────────

export const TRANSICOES_RESERVA: Record<ReservaStatus, ReservaStatus[]> = {
  EM_MONTAGEM: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["CONCLUIDA", "CANCELADA"],
  CONCLUIDA: [],
  CANCELADA: [],
};

export function transicaoReservaValida(de: ReservaStatus, para: ReservaStatus): boolean {
  if (de === para) return true;
  return TRANSICOES_RESERVA[de].includes(para);
}
