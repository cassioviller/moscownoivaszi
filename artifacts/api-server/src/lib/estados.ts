import type { Lead, Orcamento, Reserva } from "@workspace/db";
import type { EtapaLead } from "@workspace/funil-core";

/**
 * Máquina de estados do domínio. Funções puras (sem IO): validam se uma
 * transição é permitida, não o estado atual (dados legados podem estar em
 * qualquer estado). As rotas rejeitam transições inválidas com 422.
 */

export type LeadEtapa = Lead["etapa"];
export type OrcamentoStatus = Orcamento["status"];
export type ReservaStatus = Reserva["status"];

// ───────────────────────── Lead ─────────────────────────

// O funil mudou de casa no E27: o kanban precisa da mesma régua no frontend, e
// `@workspace/db` não entra no bundle do browser. Aqui ficam só os re-exports,
// para não mexer em nenhum consumidor destas rotas.
export {
  FUNIL_LEAD,
  ETAPAS_LEAD,
  transicaoLeadValida,
  avancarEtapaLead,
  etapasAlcancaveis,
} from "@workspace/funil-core";

/**
 * A trava: `EtapaLead` é declarada à mão no funil-core (para ficar livre do
 * drizzle) e `LeadEtapa` vem do enum do banco. Se alguém acrescentar uma etapa
 * numa ponta e esquecer a outra, ESTA linha deixa de compilar — é a prova de
 * que a régua duplicada não pode divergir em silêncio.
 */
type EtapasEmDia = [EtapaLead] extends [LeadEtapa]
  ? [LeadEtapa] extends [EtapaLead]
    ? true
    : never
  : never;
const _etapasEmDia: EtapasEmDia = true;
void _etapasEmDia;

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
