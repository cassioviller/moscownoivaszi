/**
 * Régua do funil no frontend. As regras NÃO vivem aqui — vêm de
 * `@workspace/funil-core`, o mesmo módulo que o api-server usa para aceitar ou
 * recusar a transição (E27). Este arquivo é só a porta de entrada, no mesmo
 * formato dos wrappers de `@/lib/financeiro/*`.
 *
 * O que é local é rótulo: o core não conhece português.
 */
export {
  ETAPAS_LEAD,
  FUNIL_LEAD,
  ETAPAS_EM_NEGOCIACAO,
  DIAS_ATENCAO,
  DIAS_CRITICO,
  transicaoLeadValida,
  etapasAlcancaveis,
  emNegociacao,
  leadParado,
  temperaturaDeParado,
  type EtapaLead,
  type LeadParado,
  type Temperatura,
} from "@workspace/funil-core";

import type { LeadParado } from "@workspace/funil-core";

/**
 * O texto do selo de lead parado. "Sem resposta" e "sem contato" dizem coisas
 * diferentes para a vendedora: o primeiro é uma noiva que escreveu e nunca foi
 * respondida — a falha mais cara do funil.
 */
export function rotuloParado({ dias, nuncaContatada }: LeadParado): string {
  if (nuncaContatada) {
    if (dias === 0) return "Sem contato — chegou hoje";
    return dias === 1 ? "Sem contato há 1 dia" : `Sem contato há ${dias} dias`;
  }
  if (dias === 0) return "Contato hoje";
  return dias === 1 ? "Parada há 1 dia" : `Parada há ${dias} dias`;
}
