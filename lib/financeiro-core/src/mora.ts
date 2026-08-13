import { brl, centavos, reais } from "./dinheiro";
import { diaDeNegocio, hojeLocal } from "./datas";

/**
 * **A parcela vencida tem multa e juros** — cláusula 9ª do instrumento de
 * locação (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **9ª** — Em caso de inadimplemento por parte do LOCATÁRIO quanto ao
 * > pagamento do aluguel, deverá incidir sobre o valor do presente instrumento,
 * > **multa pecuniária de 2%**, **juros de mora de 1% ao mês** e **correção
 * > monetária**.
 *
 * O sistema **já sabe** que a parcela está atrasada desde o E49: `estaAtrasada`
 * é derivada (nunca gravada, porque o status no banco não sabe que dia é hoje)
 * e `vencidas`/`projecao.emAtraso` totalizam o saldo vencido. **O número existe
 * e a multa não** — era a última linha da Onda A em que o ateliê deixava
 * dinheiro na mesa por o sistema não contar.
 *
 * ## "Sobre o valor do presente instrumento" — a base, decidida em 13/08/2026
 *
 * A letra da cláusula diz *o instrumento*, que é o contrato inteiro. **A dona
 * decidiu pela PARCELA vencida**, e a razão não é preferência: o **CDC, art. 52
 * §1º** limita a multa de mora a *"dois por cento do valor da prestação"*, e
 * prestação é a parcela. Num contrato de R$ 5.000,00 em 10×, a diferença é de
 * **10×** — R$ 10,00 sobre a parcela de R$ 500,00, contra R$ 100,00 sobre o
 * contrato —, e a leitura literal cobraria os 2% do contrato **de novo a cada
 * parcela atrasada**: dez parcelas em atraso dariam R$ 1.000,00 de multa, 20%
 * do contrato, sobre uma cláusula que diz 2%.
 *
 * Quem quiser a outra leitura passa o total do contrato em `saldoAberto`, não
 * muda a conta.
 *
 * ## Os juros são *pro rata die*, e o mês é de 30 dias
 *
 * *"1% ao mês"* sem dizer como se divide. O uso corrente — e o que o cálculo de
 * mora do dia a dia faz — é `1% × dias / 30`. Adotar o mês civil faria a mesma
 * dívida render diferente em fevereiro e em março, e a cláusula não pede isso.
 * Está escrito aqui e no teste para a dona poder corrigir em uma linha.
 *
 * ## A correção monetária NÃO é calculada, e isso é declarado
 *
 * A cláusula manda corrigir e **não nomeia índice**. IPCA, IGP-M e INPC dão
 * três números diferentes para a mesma dívida, e escolher um por conta própria
 * seria inventar cláusula — o mesmo limite que o E211 respeitou ao não escalar
 * o reajuste além da terceira troca. Fica como pendência da dona (P4), e a
 * ausência é dita na tela em vez de calada: quem lê o acréscimo vê que ele tem
 * multa e juros, e não correção.
 *
 * ## A mora é DERIVADA, nunca gravada
 *
 * Mesma escolha do `estaAtrasada` que ela estende, e pela mesma razão: o valor
 * cresce todo dia, e uma coluna com o acréscimo estaria errada a partir da
 * meia-noite seguinte. O que o banco guarda é o **perdão**
 * (`parcelas.mora_perdoada_em`), que é um fato datado — não uma conta.
 */

/** 9ª — a multa pecuniária, uma vez, sobre o saldo vencido. */
export const MULTA_DE_MORA_PCT = 2;

/** 9ª — os juros de mora ao mês, *pro rata die*. */
export const JUROS_DE_MORA_MENSAL_PCT = 1;

/** O divisor do *pro rata die*. Ver a nota do módulo. */
export const DIAS_DO_MES_DE_MORA = 30;

export type Mora = {
  /** Dias corridos desde o vencimento. */
  dias: number;
  /** O saldo vencido sobre o qual a conta incide, em reais. */
  saldo: number;
  multa: number;
  juros: number;
  /** Multa + juros. */
  acrescimo: number;
  /** Saldo + acréscimo — o que a noiva deve HOJE. */
  total: number;
  /** Em centavos, para quem vai somar. */
  saldoC: number;
  multaC: number;
  jurosC: number;
  acrescimoC: number;
  totalC: number;
  /** Alguém perdoou: a conta continua sendo mostrada, e o acréscimo é zero. */
  perdoada: boolean;
};

/** Dias corridos entre o vencimento e hoje, em dias de negócio — nunca negativo. */
export function diasDeMora(vencimento: string, hoje: string): number {
  const ms = Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${vencimento}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * A mora desta parcela, ou `null` quando a cláusula não incide.
 *
 * `null` é a resposta da parcela em dia e da já quitada, que juntas são a
 * esmagadora maioria — a régua só cobra o que a cláusula manda cobrar.
 *
 * A parcela **perdoada** devolve um objeto, não `null`: a tela precisa dizer
 * *"multa e juros perdoados"* em vez de simplesmente não mostrar nada, senão o
 * perdão vira invisível e a próxima leitura estranha o saldo sem acréscimo.
 */
export function moraDaParcela(params: {
  /** O que ainda está em aberto nesta parcela, em reais. */
  saldoAberto: number;
  /** O vencimento, como instante ou dia de negócio. */
  vencimento: Date | string;
  hoje?: string;
  perdoada?: boolean;
}): Mora | null {
  const saldoC = centavos(params.saldoAberto);
  if (saldoC <= 0) return null;

  const hoje = params.hoje ?? hojeLocal();
  const vencimento =
    typeof params.vencimento === "string" ? params.vencimento : diaDeNegocio(params.vencimento);
  // Vencer HOJE não é estar vencida — é o último dia de pagar em dia, e é a
  // mesma régua do `estaAtrasada` (`vencimento < hoje`), que já vale desde o
  // E49. Duas réguas de "está atrasada?" divergiriam num dia por parcela.
  const dias = diasDeMora(vencimento, hoje);
  if (dias <= 0) return null;

  const perdoada = params.perdoada === true;
  // Arredonda cada uma UMA vez, e sobre centavos: a multa é um percentual fixo
  // e os juros um percentual por dia, e somá-los em ponto flutuante antes de
  // converter acumula erro dentro da soma (é a lição do `brutoEmCentavos`).
  const multaC = perdoada ? 0 : Math.round((saldoC * MULTA_DE_MORA_PCT) / 100);
  const jurosC = perdoada
    ? 0
    : Math.round((saldoC * JUROS_DE_MORA_MENSAL_PCT * dias) / (100 * DIAS_DO_MES_DE_MORA));
  const acrescimoC = multaC + jurosC;
  const totalC = saldoC + acrescimoC;

  return {
    dias,
    saldo: reais(saldoC),
    multa: reais(multaC),
    juros: reais(jurosC),
    acrescimo: reais(acrescimoC),
    total: reais(totalC),
    saldoC,
    multaC,
    jurosC,
    acrescimoC,
    totalC,
    perdoada,
  };
}

/**
 * A frase que a tela mostra e que a trilha grava — **a mesma**.
 *
 * Ela diz o que a conta TEM e o que ela **não tem**: a correção monetária da
 * cláusula não é calculada porque o contrato não nomeia índice, e calar isso
 * faria a vendedora ler o total como se fosse a dívida inteira. Régua que
 * esconde o próprio alcance é a que autoriza (E186).
 */
export function explicacaoDaMora(m: Mora): string {
  if (m.perdoada) {
    return `Vencida há ${m.dias} dia(s) — multa e juros PERDOADOS (cláusula 9ª). Saldo ${brl(m.saldo)}.`;
  }
  return (
    `Vencida há ${m.dias} dia(s): multa de ${MULTA_DE_MORA_PCT}% = ${brl(m.multa)} · ` +
    `juros de ${JUROS_DE_MORA_MENSAL_PCT}% ao mês (${m.dias}/${DIAS_DO_MES_DE_MORA}) = ${brl(m.juros)}. ` +
    `Saldo ${brl(m.saldo)} + ${brl(m.acrescimo)} = ${brl(m.total)}. ` +
    `Sem correção monetária — o contrato não nomeia índice.`
  );
}
