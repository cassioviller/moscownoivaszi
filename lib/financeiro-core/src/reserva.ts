import { brl, centavos, reais } from "./dinheiro";
import { addDias, diaDeNegocio, diaLocal } from "./datas";

/**
 * **A reserva de 40% e o prazo dos 20 dias** — E218, cláusula 8ª §1º e o
 * parágrafo único do objeto (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **8ª §1º** — O LOCATÁRIO poderá fazer reserva antecipada dos trajes e/ou
 * > acessórios mediante o pagamento antecipado de **40% do valor total** do
 * > aluguel e assinatura do presente instrumento.
 *
 * > **PARÁGRAFO ÚNICO (do objeto)** — Em caso de parcelamento, o restante do
 * > valor deverá ser pago em até **20 dias antes da data da retirada** dos
 * > itens objetos de locação.
 *
 * ## Uma AVISA e a outra RECUSA, e a diferença foi medida
 *
 * As duas regras são do mesmo contrato e recebem tratamentos opostos, o que
 * exige justificativa. Ela está nos números, colhidos antes de escrever a
 * primeira linha (13/08/2026, `moscow_base`):
 *
 * | | |
 * |---|---|
 * | contratos ATIVOS | 311, sendo **211 com carnê** e 208 com entrada |
 * | **entrada abaixo dos 40%** | **101** — quase metade |
 * | entrada média | **67,6%** do total |
 * | parcelas de plano em contrato com retirada | 6, e **2** depois do prazo |
 *
 * **101 contratos vivos têm entrada menor que 40%.** Uma régua que recusasse
 * tornaria quase metade do que a loja já fez irreproduzível pela porta — e a
 * entrada é onde a dona negocia. Então a 8ª §1º **avisa**: mostra os 40%, diz
 * quanto falta, e deixa passar. Quem decide o desconto é quem vende.
 *
 * O prazo dos 20 dias não tem essa natureza: ele é o que garante o dinheiro
 * ANTES de a peça sair pela porta. Ele **recusa** — e recusa pouco, porque hoje
 * quase nenhum contrato declara a retirada (S-C35).
 *
 * ## O prazo NÃO vale para toda parcela, e é a decisão de desenho do épico
 *
 * O parágrafo fala do **parcelamento do aluguel**. Aplicá-lo a toda parcela
 * recusaria a cobrança de **avaria** (E214) e a de **atraso na devolução**
 * (E212), que nascem **depois** da retirada por definição — e a de mora (E213),
 * que nasce do recebimento. A régua vale para o CARNÊ (`origem: PLANO`), que é
 * o que a cláusula chama de "restante do valor".
 */

/** 8ª §1º — o percentual da reserva antecipada. */
export const RESERVA_PCT = 40;

/** § único do objeto — o restante entra até este número de dias antes da retirada. */
export const PRAZO_ANTES_DA_RETIRADA_DIAS = 20;

/** A entrada que a 8ª §1º sugere para este total, em reais. */
export function entradaDaReserva(valorTotal: number): number {
  return reais(Math.round((centavos(valorTotal) * RESERVA_PCT) / 100));
}

export type AvisoDeEntrada = {
  /** O que a cláusula sugere, em reais. */
  sugerida: number;
  /** Quanto falta para chegar lá. */
  falta: number;
  /** Quanto a entrada representa do total, em pontos percentuais. */
  pct: number;
  /** A frase que a tela mostra — uma grafia só. */
  aviso: string;
};

/**
 * O aviso da 8ª §1º, ou `null` quando a entrada cumpre a cláusula.
 *
 * `null` também para contrato sem valor: não há percentual de zero, e inventar
 * um aviso ali seria ruído em cima de dado que ainda não existe.
 */
export function avisoDeEntradaAbaixoDaReserva(
  entrada: number,
  valorTotal: number,
): AvisoDeEntrada | null {
  const totalC = centavos(valorTotal);
  if (totalC <= 0) return null;
  const entradaC = centavos(entrada);
  const sugeridaC = Math.round((totalC * RESERVA_PCT) / 100);
  if (entradaC >= sugeridaC) return null;

  const faltaC = sugeridaC - entradaC;
  // Uma casa decimal: "39,9%" é informação, "39,87654%" é ruído no balcão.
  const pct = Math.round((entradaC / totalC) * 1000) / 10;
  return {
    sugerida: reais(sugeridaC),
    falta: reais(faltaC),
    pct,
    aviso:
      `A cláusula 8ª §1º pede ${RESERVA_PCT}% de reserva — ${brl(reais(sugeridaC))}. ` +
      `Esta entrada é ${pct}% do total, ${brl(reais(faltaC))} abaixo. ` +
      `Pode seguir assim: quem decide é a loja.`,
  };
}

export type ForaDoPrazoDaRetirada = {
  /** O último dia em que o carnê pode vencer, como dia de negócio. */
  limite: string;
  /** Quantos dias a parcela passou do limite. */
  diasDepois: number;
  detalhe: string;
};

const ddmmaaaa = (ymd: string) => ymd.split("-").reverse().join("/");

/**
 * A recusa do § único para um vencimento de CARNÊ, ou `null` quando cabe.
 *
 * Sem data de retirada não há prazo a comparar, e a resposta é `null` — não uma
 * recusa. É a mesma escolha do E222 e pela mesma razão medida: **722 dos 723
 * contratos não declaram a retirada** (S-C35). Uma régua que exigisse a data
 * recusaria o carnê que sempre funcionou.
 */
export function foraDoPrazoDaRetirada(
  vencimento: Date | string,
  dataRetirada: Date | string | null | undefined,
): ForaDoPrazoDaRetirada | null {
  if (dataRetirada === null || dataRetirada === undefined) return null;
  const retirada = new Date(dataRetirada);
  const venc = new Date(vencimento);
  if (Number.isNaN(retirada.getTime()) || Number.isNaN(venc.getTime())) return null;

  /**
   * **As duas pontas não são da mesma natureza, e o teste é quem cobrou.**
   *
   * `dataRetirada` é um **INSTANTE** — o E222 fez a hora dela importar
   * (expediente da 4ª, 10:30 às 19:00). `parcelas.vencimento` é **data de
   * negócio**, ancorada ao meio-dia (`ancoraDeNegocio`). Passar as duas pelo
   * mesmo `diaDeNegocio`, que lê em UTC porque a âncora garante o dia, dava
   * 16/08 para as 23:59 de 15/08 em São Paulo — a hora decidindo o veredito,
   * que é a classe da S-O117.
   *
   * Então cada uma é lida como o que é: a retirada pelo **dia local** dela, e o
   * vencimento pela âncora. A aritmética dos 20 dias acontece em dias de
   * calendário, onde a cláusula a escreveu.
   */
  const limite = addDias(diaLocal(retirada), -PRAZO_ANTES_DA_RETIRADA_DIAS);
  const vencDia = diaDeNegocio(venc);
  // "Até 20 dias antes" INCLUI o vigésimo dia: vencer no próprio limite cumpre.
  if (vencDia <= limite) return null;

  const diasDepois = Math.round(
    (Date.parse(`${vencDia}T00:00:00Z`) - Date.parse(`${limite}T00:00:00Z`)) / 86_400_000,
  );
  return {
    limite,
    diasDepois,
    detalhe:
      `O contrato pede o restante pago até ${PRAZO_ANTES_DA_RETIRADA_DIAS} dias antes da retirada ` +
      `(parágrafo único) — até ${ddmmaaaa(limite)}. ` +
      `Esta parcela vence em ${ddmmaaaa(vencDia)}, ${diasDepois} dia(s) depois do limite.`,
  };
}
