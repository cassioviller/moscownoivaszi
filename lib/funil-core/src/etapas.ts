/**
 * As etapas do funil, declaradas aqui em vez de derivadas do schema do banco.
 * É de propósito: o frontend precisa da régua e não pode arrastar `@workspace/db`
 * (com drizzle e pg junto) para dentro do bundle. O api-server prova em tempo de
 * compilação que esta lista e o enum do banco não divergiram — ver `estados.ts`.
 */
export const ETAPAS_LEAD = [
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
  "PERDIDO",
] as const;

export type EtapaLead = (typeof ETAPAS_LEAD)[number];

/** Funil linear da noiva. PERDIDO fica fora (estado lateral, alcançável de qualquer ponto). */
export const FUNIL_LEAD: EtapaLead[] = ETAPAS_LEAD.filter((e) => e !== "PERDIDO");

/**
 * Transição de etapa permitida: avança no funil (nunca regride), sempre pode
 * marcar como PERDIDO, e um lead PERDIDO pode ser revivido para qualquer etapa
 * do funil. Manter no mesmo estado é sempre válido (no-op).
 */
export function transicaoLeadValida(de: EtapaLead, para: EtapaLead): boolean {
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
export function avancarEtapaLead(atual: EtapaLead, alvo: EtapaLead): EtapaLead {
  const iAtual = FUNIL_LEAD.indexOf(atual);
  const iAlvo = FUNIL_LEAD.indexOf(alvo);
  if (iAtual === -1 || iAlvo === -1) return atual;
  return iAlvo > iAtual ? alvo : atual;
}

/**
 * Para onde este lead pode ir. O kanban usa isto para desabilitar as colunas
 * que recusariam o drop: melhor a coluna não aceitar o card do que aceitar e
 * o servidor devolver 422 depois da animação.
 */
export function etapasAlcancaveis(de: EtapaLead): EtapaLead[] {
  return ETAPAS_LEAD.filter((para) => para !== de && transicaoLeadValida(de, para));
}
