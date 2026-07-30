import { brl } from "@/lib/formatos";

/**
 * E128 (C5/C7) — a confirmação de dinheiro diz o número CERTO.
 *
 * A régua do E10 manda a confirmação nomear o objeto e o que se perde — "o
 * valor em dinheiro quando houver". A revisão achou três diálogos fora, todos
 * de dinheiro, e o pior deles MENTINDO: o estorno de parcela citava o PREVISTO
 * onde o caixa perde o RECEBIDO — parcela de R$ 1.000,00 com R$ 300,00
 * recebidos, o diálogo dizia que desfazia R$ 1.000,00 (fotografado no
 * relatório do épico, `capturas/e128/`).
 *
 * As frases moram aqui, em função pura, porque o número que cada uma cita é
 * uma DECISÃO (recebido × previsto × fatia) — e a varredura de destrutivas
 * cobre só a ausência de confirmação, nunca o texto (aviso do próprio E10).
 */

/** O estorno desfaz o que ENTROU — `valorRecebido`, nunca o previsto. */
export function fraseEstornoParcela(rotulo: string, p: { valorRecebido?: number | null }): string {
  return `O recebimento de ${rotulo} (${brl(p.valorRecebido ?? 0)}) será desfeito e a parcela volta a ficar em aberto.`;
}

/** A remoção tira do plano o que estava PREVISTO — aqui o previsto é o certo. */
export function fraseRemocaoParcela(rotulo: string, p: { valorPrevisto: number }): string {
  return `${rotulo} (${brl(p.valorPrevisto)}) será removida do plano. Esta ação não pode ser desfeita.`;
}

/** A conta em aberto sai da carteira com o valor que a carteira esperava. */
export function fraseRemocaoConta(c: { descricao: string; valorPrevisto: number }): string {
  return `${c.descricao} (${brl(c.valorPrevisto)}) sai da carteira de contas a pagar. Só contas em aberto podem ser removidas.`;
}

/**
 * O estorno de pagamento nomeia a saída e a linha clicada. Numa saída
 * CONJUNTA o total não desce por linha (cada conta carrega a própria fatia
 * rateada) — a frase nomeia a fatia desta linha e o tamanho do lote.
 */
export function fraseEstornoPagamento(p: {
  contas: number;
  descricao: string;
  valorDaLinha: number;
}): string {
  if (p.contas > 1) {
    return `A saída de caixa some e as ${p.contas} contas que ela quitou voltam para em aberto — desta linha, ${p.descricao} (${brl(p.valorDaLinha)}).`;
  }
  return `A saída de ${brl(p.valorDaLinha)} que quitou ${p.descricao} some, e a conta volta para em aberto.`;
}
