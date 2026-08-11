import { brl } from "@/lib/formatos";
import { reais } from "./dinheiro";

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

/**
 * A remoção tira do plano o que estava PREVISTO — aqui o previsto é o certo.
 *
 * P7 (E169) — e quando a parcela é do CARNÊ, a frase diz a consequência com o
 * número. Removida a parcela 10 de R$ 500,00 de um carnê de R$ 5.000,00, o
 * plano passa a somar **R$ 4.500,00 de R$ 5.000,00**: até o E169 não existia
 * gesto nenhum na aplicação que devolvesse aqueles R$ 500,00 — `temCarne`
 * seguia verdadeiro e o `gerar-plano` respondia 409 JA_TEM_PLANO para sempre.
 * Agora existe (o formulário reabre e completa), e a frase diz onde ele está,
 * porque "não pode ser desfeita" deixou de ser verdade e virava mentira.
 */
export function fraseRemocaoParcela(
  rotulo: string,
  p: { valorPrevisto: number; origem?: string },
  carne?: { somaDepoisCentavos: number; totalContratoCentavos: number },
): string {
  const abertura = `${rotulo} (${brl(p.valorPrevisto)}) será removida do plano.`;
  if (p.origem === "PLANO" && carne && carne.somaDepoisCentavos < carne.totalContratoCentavos) {
    return (
      `${abertura} O carnê passa a somar ${brl(reais(carne.somaDepoisCentavos))} de um contrato ` +
      `de ${brl(reais(carne.totalContratoCentavos))} — para repor a diferença você vai precisar ` +
      `gerar as parcelas que faltam, ali embaixo.`
    );
  }
  return `${abertura} Esta ação não pode ser desfeita.`;
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
