import {
  DEDUCAO_DA_RESCISAO_PCT,
  DIAS_PARA_EXTRAVIO,
  JUROS_DE_MORA_MENSAL_PCT,
  MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL,
  MULTA_DE_ATRASO,
  MULTA_DE_MORA_PCT,
  MULTIPLICADOR_DE_EXTRAVIO,
  PRAZO_DEVOLUCAO_DA_LOJA_DIAS,
  TAXA_LIMPEZA_MAXIMA,
  TAXA_LIMPEZA_MINIMA,
  TETO_DO_DANO_EM_ALUGUEIS,
} from "@workspace/financeiro-core";
import { brl } from "./formatos";

/**
 * **E230/S-C202 — das seis cláusulas de dinheiro, só a 9ª descia ao portal.**
 *
 * O manual da noiva passou a explicar avaria, atraso, extravio, rescisão e
 * peça exclusiva (lote dos manuais, 14/08) — e a tela DELA seguia muda: a
 * noiva lia as regras num documento e não as via onde acompanha o próprio
 * contrato. Esta é a seção que faltava.
 *
 * **Cada número vem da CONSTANTE que a conta usa** — nenhuma frase carrega
 * um literal de dinheiro ou percentual. É a lição da S-C212 pelo lado da
 * tela: um número escrito à mão aqui viraria a segunda grafia que diverge da
 * conta no dia em que a dona mudar a regra, e o portal passaria a prometer o
 * que a porta não pratica. O teste prega a DERIVAÇÃO (a frase contém o valor
 * importado), não o valor.
 *
 * As frases são gerais de propósito: os VALORES do contrato dela (aluguel por
 * peça, fração exclusiva) variam por contrato, e a conta específica aparece
 * onde acontece — a mora na linha da parcela, a rescisão no diálogo de
 * cancelar. Aqui é o mapa, não o extrato.
 */
export interface ClausulaDoPortal {
  titulo: string;
  clausula: string;
  texto: string;
}

export function clausulasDoContrato(): ClausulaDoPortal[] {
  return [
    {
      titulo: "Parcela em atraso",
      clausula: "9ª",
      texto:
        `Parcela vencida tem multa de ${MULTA_DE_MORA_PCT}% e juros de ` +
        `${JUROS_DE_MORA_MENSAL_PCT}% ao mês, contados por dia. O acréscimo aparece na ` +
        `própria parcela, acima — e sai se a loja o perdoar.`,
    },
    {
      titulo: "Devolução fora do prazo",
      clausula: "16ª",
      texto:
        `Devolver depois do combinado tem multa de ${brl(MULTA_DE_ATRASO)}, mais o aluguel ` +
        `proporcional de cada peça por dia de atraso.`,
    },
    {
      titulo: "Peça não devolvida",
      clausula: "16ª",
      texto:
        `Passados ${DIAS_PARA_EXTRAVIO} dias de atraso, a peça é tratada como extraviada: ` +
        `${MULTIPLICADOR_DE_EXTRAVIO} vezes o aluguel de cada peça não devolvida.`,
    },
    {
      titulo: "Dano ou limpeza fora do uso normal",
      clausula: "14ª e 15ª",
      texto:
        `A higienização comum é da loja. Dano ou sujeira fora do uso normal tem taxa entre ` +
        `${brl(TAXA_LIMPEZA_MINIMA)} e ${brl(TAXA_LIMPEZA_MAXIMA)}, e o reparo de dano vai ` +
        `até ${TETO_DO_DANO_EM_ALUGUEIS} vezes o aluguel da peça danificada.`,
    },
    {
      titulo: "Desistência",
      clausula: "8ª, 11ª e 13ª",
      texto:
        `A reserva paga não é devolvida. Do restante já pago, a loja retém ` +
        `${DEDUCAO_DA_RESCISAO_PCT}% e devolve o resto. Quando é a loja que cancela, ela ` +
        `devolve tudo o que foi pago, em até ${PRAZO_DEVOLUCAO_DA_LOJA_DIAS} dias.`,
    },
    {
      titulo: "Peça exclusiva de primeiro aluguel",
      clausula: "12ª",
      texto:
        MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL === 100
          ? "Na desistência, a parte paga de uma peça exclusiva de primeiro aluguel fica retida integralmente."
          : `Na desistência, ${MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL}% da parte paga de uma peça ` +
            `exclusiva de primeiro aluguel fica retida.`,
    },
  ];
}
