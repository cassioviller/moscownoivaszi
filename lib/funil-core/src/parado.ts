import { diaLocal, diasEntre, hojeLocal } from "@workspace/financeiro-core";
import { FUNIL_LEAD, type EtapaLead } from "./etapas";

/**
 * "Lead parado há N dias sem contato" — o alerta que a vendedora pediu.
 *
 * Conta em dias-calendário no fuso da loja, não em horas: um contato às 21h e
 * a consulta às 9h do dia seguinte são "ontem", não "12 horas". `diaLocal`
 * (instante → dia da loja) é o mesmo régua da cobrança; ler o contato em UTC
 * jogaria toda ligação do fim da tarde para o dia seguinte.
 */

/**
 * Só quem ainda está em negociação envelhece. Depois de CONTRATO_FECHADO a
 * noiva não é mais um lead a recontatar — é atendimento em curso (provas,
 * retirada), e cobrar "recontato" ali seria ruído. PERDIDO, idem: está fechado.
 */
export const ETAPAS_EM_NEGOCIACAO: EtapaLead[] = FUNIL_LEAD.slice(
  0,
  FUNIL_LEAD.indexOf("CONTRATO_FECHADO"),
);

export function emNegociacao(etapa: EtapaLead): boolean {
  return ETAPAS_EM_NEGOCIACAO.includes(etapa);
}

/** Sem contato há mais que isto, o card acende. */
export const DIAS_ATENCAO = 7;
/** Sem contato há mais que isto, o card acende em vermelho. */
export const DIAS_CRITICO = 14;

export type Temperatura = "ok" | "atencao" | "critico";

export type LeadParado = {
  /** Dias-calendário desde o último contato (ou desde a criação, se nunca houve). */
  dias: number;
  temperatura: Temperatura;
  /** True quando nunca se registrou contato — a contagem corre desde a criação. */
  nuncaContatada: boolean;
};

export function temperaturaDeParado(dias: number): Temperatura {
  if (dias > DIAS_CRITICO) return "critico";
  if (dias > DIAS_ATENCAO) return "atencao";
  return "ok";
}

/**
 * Há quanto tempo este lead está parado. Um lead sem NENHUM contato registrado
 * conta desde a criação — é o caso mais grave, não o mais inocente: a noiva
 * escreveu e ninguém respondeu. Etapas fora da negociação retornam `null`
 * (não envelhecem).
 */
export function leadParado(
  lead: {
    etapa: EtapaLead;
    createdAt: Date | string;
    ultimoContatoEm?: Date | string | null;
  },
  hoje: string = hojeLocal(),
): LeadParado | null {
  if (!emNegociacao(lead.etapa)) return null;

  const nuncaContatada = !lead.ultimoContatoEm;
  const referencia = lead.ultimoContatoEm ?? lead.createdAt;
  // Relógio torto ou contato registrado com data futura não vira dias negativos.
  const dias = Math.max(0, diasEntre(diaLocal(referencia), hoje));

  return { dias, temperatura: temperaturaDeParado(dias), nuncaContatada };
}
