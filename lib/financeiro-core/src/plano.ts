import { addMeses, hojeLocal } from "./datas";
import { centavos } from "./dinheiro";

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

/**
 * S-M19 — "este contrato já tem carnê?" pela MESMA pergunta do servidor.
 *
 * O `gerar-plano` recusa por `origem === "PLANO"` desde a S26: parcela de
 * avaria ou avulsa NÃO é carnê, e um contrato pode (e deve) gerar o dele com
 * elas já lançadas — a ordem do balcão é essa. A tela perguntava
 * `parcelas.length > 0`, a heurística pré-S26: um reparo de R$ 350,00 cobrado
 * antes do carnê escondia o "Gerar plano" de um contrato de R$ 5.000,00 para
 * sempre.
 *
 * E169: a função subiu da tela para o core, porque o `gerar-plano` do servidor
 * passou a precisar da mesma pergunta com a mesma resposta (P7).
 */
export function temCarne(parcelas: ReadonlyArray<{ origem: string }>): boolean {
  return parcelas.some((p) => p.origem === "PLANO");
}

/** Uma parcela como as telas e a rota a enxergam para somar o carnê. */
export type ParcelaDoCarne = {
  origem: string;
  status: string;
  valorPrevisto: number;
};

/**
 * P8 (E169) — quanto o CARNÊ soma. Só `origem: PLANO`, e só o que está vivo.
 *
 * O alerta de divergência da tela de contrato somava TODAS as parcelas não
 * canceladas e comparava com `valorTotal`. A parcela de avaria (`origem:
 * AVARIA`) entra nessa soma por construção: **num contrato de R$ 5.000,00 com
 * um reparo de R$ 350,00, o alerta vermelho "o total do plano difere do valor
 * total do contrato (R$ 5.000,00)" acende sobre um estado que o servidor
 * considera perfeitamente correto** — e ele existe justamente para denunciar
 * carnê corrompido. Alarme que toca todo dia deixa de ser lido no dia em que a
 * divergência é verdadeira.
 *
 * É a mesma separação que o E165 fez no papel (P12): o plano lista `origem:
 * PLANO`, que soma o total por construção, e o resto vai para "Cobranças fora
 * do valor total".
 */
export function totalDoCarneCentavos(parcelas: ReadonlyArray<ParcelaDoCarne>): number {
  return parcelas
    .filter((p) => p.origem === "PLANO" && p.status !== "CANCELADA")
    .reduce((total, p) => total + centavos(p.valorPrevisto), 0);
}

/**
 * P7 (E169) — o buraco que a remoção de uma parcela do carnê abriu, em
 * centavos. Zero quando o carnê fecha, e zero quando ele nem existe.
 *
 * Removida a parcela 10 de R$ 500,00 de um carnê de R$ 5.000,00, o plano passa
 * a somar **R$ 4.500,00 de R$ 5.000,00**, `temCarne` segue verdadeiro e o
 * `gerar-plano` respondia 409 JA_TEM_PLANO para sempre: **não existia gesto
 * nenhum na aplicação que devolvesse aqueles R$ 500,00**. Esta é a conta que a
 * tela usa para reabrir o formulário e que a rota usa para aceitar completar.
 *
 * Nunca negativo: carnê que soma MAIS que o contrato é a outra divergência, e
 * quem a denuncia é o alerta, não este número.
 */
export function faltanteDoCarneCentavos(
  parcelas: ReadonlyArray<ParcelaDoCarne>,
  totalContratoCentavos: number,
): number {
  if (!temCarne(parcelas)) return 0;
  return Math.max(0, totalContratoCentavos - totalDoCarneCentavos(parcelas));
}
