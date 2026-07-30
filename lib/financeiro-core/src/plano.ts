import { addMeses, hojeLocal } from "./datas";

/**
 * O plano de parcelas — o carnê que a loja combina com a noiva (E95).
 *
 * Antes deste módulo a mesma conta existia em dois lugares e discordava dos
 * dois jeitos possíveis:
 *
 * - **Valor.** A tela dividia em reais float
 *   (`Math.floor((restante / n) * 100) / 100`) e o servidor em centavos
 *   inteiros. Medido pela trilha C: **1,77% dos planos divergem**. R$ 1.282,00
 *   em 10x divide exato em R$ 128,20 — a tela produzia `128,19 ×9 + 128,29`. E
 *   o erro era 100% silencioso, porque a soma sempre fecha e a guarda
 *   `PARCELAS_NAO_BATEM` nunca dispara: a única testemunha era o carnê impresso.
 * - **Data.** A tela espaçava por MÊS (`addMonths`) e o servidor por 30 DIAS
 *   corridos. Pior, `primeiroVencimento` significava coisas diferentes: na tela
 *   sempre a parcela 1; no servidor, a ENTRADA quando havia entrada e a parcela
 *   1 quando não havia — o mesmo campo mudando de sentido conforme outro campo.
 *
 * **A régua, decidida pelo dono em 2026-07-27:** mensal por dia fixo, e
 * `primeiroVencimento` é sempre **a parcela 1**. A entrada tem data própria
 * (o padrão é hoje). É o que a tela — o único caminho vivo — já fazia, então
 * nenhum carnê muda de comportamento; quem se alinha é o `gerar-plano`.
 * Contratos já existentes não são recalculados.
 */

/** Uma linha do carnê. `numero` 0 é a entrada. */
export type ParcelaPlanejada = {
  numero: number;
  descricao: string;
  valorCentavos: number;
  /** Dia de negócio, YYYY-MM-DD. Quem faz a parcela faz a data dela. */
  vencimento: string;
};

/**
 * Rateio do restante em `n` parcelas, tudo em CENTAVOS inteiros.
 *
 * Invariantes (provadas por propriedade em `lote25-rateio-parcelas-unit`):
 * - a soma das parcelas é EXATAMENTE o restante, para qualquer valor/n;
 * - as n−1 primeiras valem floor(restante/n); a última leva a sobra
 *   (restante mod n, sempre < n centavos a mais que as irmãs);
 * - nenhuma parcela é negativa.
 */
export function ratearRestante(restanteCentavos: number, n: number): number[] {
  const base = Math.floor(restanteCentavos / n);
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? restanteCentavos - base * (n - 1) : base,
  );
}

export type PlanoParams = {
  totalCentavos: number;
  /** Ausente ou 0 = sem entrada; o carnê começa na parcela 1. */
  entradaCentavos?: number;
  /** Quantas parcelas dividem o restante. Ignorado se o restante for 0. */
  numParcelas: number;
  /** Dia de negócio (YYYY-MM-DD) da PARCELA 1 — nunca o da entrada. */
  primeiroVencimento: string;
  /** Dia de negócio da entrada. Padrão: hoje no fuso da loja. */
  vencimentoEntrada?: string;
};

/**
 * Monta o carnê inteiro: valores e datas, na ordem em que a noiva vai pagar.
 *
 * Recusa entrada maior que o total e plano sem parcelas para um restante
 * positivo — nas duas situações não existe carnê correto a devolver, e um
 * plano silenciosamente errado é o defeito que este módulo existe para matar.
 */
export function montarPlanoParcelas(params: PlanoParams): ParcelaPlanejada[] {
  const { totalCentavos, primeiroVencimento } = params;
  const entradaCentavos = params.entradaCentavos ?? 0;

  if (entradaCentavos < 0 || totalCentavos < 0) {
    throw new Error("PLANO_VALOR_NEGATIVO");
  }
  if (entradaCentavos > totalCentavos) {
    throw new Error("PLANO_ENTRADA_MAIOR");
  }

  const restante = totalCentavos - entradaCentavos;
  const n = restante > 0 ? params.numParcelas : 0;
  if (restante > 0 && (!Number.isInteger(n) || n < 1)) {
    throw new Error("PLANO_SEM_PARCELAS");
  }

  const linhas: ParcelaPlanejada[] = [];
  if (entradaCentavos > 0) {
    linhas.push({
      numero: 0,
      descricao: "Entrada",
      valorCentavos: entradaCentavos,
      vencimento: params.vencimentoEntrada ?? hojeLocal(),
    });
  }

  const valores = n > 0 ? ratearRestante(restante, n) : [];
  for (let i = 0; i < n; i++) {
    linhas.push({
      numero: i + 1,
      descricao: `Parcela ${i + 1}/${n}`,
      valorCentavos: valores[i],
      // A partir da ÂNCORA, não da parcela anterior: ver `addMeses`.
      vencimento: addMeses(primeiroVencimento, i),
    });
  }

  return linhas;
}
