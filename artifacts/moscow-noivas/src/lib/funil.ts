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
  // F2: quem já converteu não tem mais a origem editável — e a régua é a mesma
  // que o relatório de conversão usa para contar, não uma cópia da tela.
  converteu,
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

/**
 * S-O10 — o card mostra o "sim" da noiva **sem que ele vire coluna do funil**.
 *
 * A pergunta que o funil responde é *onde ela está*, e o aceite não muda isso:
 * ela segue negociando até o contrato existir. O que o aceite muda é o que a
 * LOJA tem de fazer — e quem varre o kanban atrás de onde a venda emperrou não
 * enxergava a diferença entre "mandei a proposta" e "ela já disse sim".
 *
 * A alternativa era uma décima segunda etapa: enum do banco com migração,
 * régua de transição, régua de conversão (que conta a partir de
 * CONTRATO_FECHADO, e continuaria contando — aceite não é venda), e mais uma
 * coluna para arrastar num celular que já tem onze. O selo entrega a mesma
 * informação pelo preço de um carimbo.
 *
 * Some quando o contrato fecha: aí o aceite virou história, e o card tem outra
 * coisa a dizer.
 */
export function mostraSeloAceite(lead: {
  aceiteEm?: string | null;
  contratoFechadoEm?: string | null;
}): boolean {
  return !!lead.aceiteEm && !lead.contratoFechadoEm;
}
