import { brl, centavos } from "./dinheiro";

/**
 * **A taxa de limpeza e a de dano** — cláusulas 14ª e 15ª do instrumento de
 * locação (`docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **14ª** — Caso os trajes e/ou acessórios sejam devolvidos com excesso de
 * > sujeira ou manchas, será cobrada uma taxa a partir de **R$ 350,00** até
 * > **R$ 2.500,00** para a limpeza das peças (caso sujeira extraordinária, como
 * > por exemplo tinta, esmalte, vômito, sangue, ou a barra com muita sujeira de
 * > terra ou barro). O qual será avaliado pelo **grau de dificuldade** durante o
 * > recebimento durante a devolução dos objetos de locação.
 * >
 * > **15ª** — Se houver qualquer dano aos trajes e/ou acessórios locados, ou
 * > sujeira ou mancha que não podem ser removidas com lavagem, o LOCATÁRIO
 * > pagará uma taxa a ser definida no momento da devolução de acordo com o tipo
 * > de dano, **não excedendo cinco vezes o valor do aluguel de cada peça
 * > danificada**.
 *
 * ## São DUAS cláusulas, e por isso são duas réguas
 *
 * O sistema tinha um campo só, `avarias.custo_reparo`, livre: sem piso, sem
 * teto e sem dizer de qual das duas cláusulas aquele número saiu. A vendedora
 * digitava R$ 50,00 ou R$ 9.000,00 e nada reclamava.
 *
 * As duas faixas não têm a mesma forma, e é isso que obriga a separá-las:
 *
 * - a da **limpeza** é ABSOLUTA — 350 a 2.500 —, vale para qualquer peça e não
 *   depende de contrato nenhum;
 * - a do **dano** é RELATIVA à peça — cinco aluguéis dela —, e só existe onde
 *   existe aluguel, isto é, dentro de um contrato.
 *
 * Guardar as duas no mesmo campo sem tipo é o que fazia a régua ser
 * impossível: não há como conferir um número sem saber qual cláusula o rege.
 *
 * ## O que a régua faz, e o que ela não faz
 *
 * Ela **não impede a dona de decidir** — obriga a dizer por quê. Valor que
 * VIOLA um número do papel entra com **justificativa escrita**, e a
 * justificativa vai para a trilha (`AVARIA_FORA_DA_FAIXA`). É o mesmo desenho
 * do resto da casa: a porta não vira parede, vira registro.
 *
 * E onde o papel é **silente** — o dano numa peça que não está em contrato, e
 * portanto não tem aluguel —, a régua não inventa número nem barra: ela declara
 * que **não conferiu**, e a declaração aparece na tela e na trilha. O porquê
 * está em `avaliarTaxaDeAvaria`.
 */

/** Cláusula 14ª — o piso da taxa de limpeza, em reais. */
export const TAXA_LIMPEZA_MINIMA = 350;
/** Cláusula 14ª — o teto da taxa de limpeza, em reais. */
export const TAXA_LIMPEZA_MAXIMA = 2500;
/** Cláusula 15ª — o teto do dano, contado em aluguéis da peça danificada. */
export const TETO_DO_DANO_EM_ALUGUEIS = 5;

/**
 * De qual cláusula esta taxa saiu.
 *
 * `LIMPEZA` é a 14ª: sujeira extraordinária que **sai com lavagem** (tinta,
 * esmalte, vômito, sangue, barra com terra). `DANO` é a 15ª: rasgo, queimadura
 * — e também a mancha que **não sai**, que a própria 15ª puxa para si.
 */
export type TipoDeAvaria = "LIMPEZA" | "DANO";

export type FaixaDaTaxa = {
  tipo: TipoDeAvaria;
  /** A cláusula que manda, para a mensagem citar o papel. */
  clausula: "14ª" | "15ª";
  /** Piso em reais, ou `null` quando a cláusula não dá piso (o dano não dá). */
  piso: number | null;
  /** Teto em reais, ou `null` quando ele não é calculável. */
  teto: number | null;
  /**
   * O teto do dano não pôde ser calculado porque **a peça não está em contrato
   * nenhum** — sem aluguel não há os cinco aluguéis da 15ª.
   */
  tetoIndeterminado: boolean;
};

/**
 * A faixa que a cláusula impõe a esta taxa.
 *
 * `aluguelDaPeca` é o `valorUnitario` do item de contrato daquela peça — o
 * valor que a noiva pagou para usá-la. `null` significa "a peça não está em
 * contrato": ou a avaria nasceu antes de haver contrato, ou a peça não é item
 * dele.
 */
export function faixaDaTaxaDeAvaria(params: {
  tipo: TipoDeAvaria;
  aluguelDaPeca: number | null;
}): FaixaDaTaxa {
  if (params.tipo === "LIMPEZA") {
    return {
      tipo: "LIMPEZA",
      clausula: "14ª",
      piso: TAXA_LIMPEZA_MINIMA,
      teto: TAXA_LIMPEZA_MAXIMA,
      tetoIndeterminado: false,
    };
  }
  // A 15ª não dá piso: *"uma taxa a ser definida no momento da devolução de
  // acordo com o TIPO DE DANO"*. Um puído de R$ 80,00 é um dano legítimo de
  // R$ 80,00, e inventar um mínimo aqui seria inventar cláusula.
  const aluguel = params.aluguelDaPeca;
  const temAluguel = aluguel !== null && aluguel > 0;
  return {
    tipo: "DANO",
    clausula: "15ª",
    piso: null,
    teto: temAluguel ? aluguel * TETO_DO_DANO_EM_ALUGUEIS : null,
    tetoIndeterminado: !temAluguel,
  };
}

/**
 * O que há de notável nesta taxa.
 *
 * Os dois primeiros são **violação**: a cláusula dá um número e o valor o quebra.
 * O terceiro não é — é a cláusula **não alcançando** o caso, e a diferença de
 * tratamento entre eles é a decisão mais importante deste módulo (abaixo).
 */
export type MotivoForaDaFaixa = "ABAIXO_DO_PISO" | "ACIMA_DO_TETO" | "TETO_INDETERMINADO";

export type VeredictoDaTaxa = FaixaDaTaxa & {
  /** O valor avaliado, em reais — `null` quando a avaria ainda não tem custo. */
  valor: number | null;
  /**
   * A cláusula pôde ser CONFERIDA? `false` só no dano cuja peça não está em
   * contrato: não há aluguel, então não há os cinco aluguéis da 15ª.
   */
  conferida: boolean;
  /** O valor respeita o número que a cláusula DÁ (quando ela dá algum). */
  dentroDaFaixa: boolean;
  motivo: MotivoForaDaFaixa | null;
  /** Violou um número do papel: a régua pede a razão por escrito. */
  exigeJustificativa: boolean;
  /** Violação OU conta não conferida — as duas merecem linha na trilha. */
  mereceTrilha: boolean;
};

/**
 * Este valor cabe no que a cláusula permite?
 *
 * **Avaria sem custo passa, e não é buraco.** `custo_reparo` é nulável desde o
 * E71 — *"null quando ainda não avaliado"* —, e a cláusula governa uma COBRANÇA,
 * não um registro. O registro sem número não cobra ninguém; e a única porta que
 * transforma avaria em dinheiro (`POST /avarias/:id/cobrar`) já recusa o custo
 * ausente com `AVARIA_SEM_CUSTO`.
 *
 * ## O teto indeterminado NÃO barra, e é a decisão que este módulo declara
 *
 * A primeira escrita deste épico recusava o dano cuja peça não está em contrato,
 * exigindo justificativa — pelo argumento de que o teto é a única proteção da
 * noiva contra um número arbitrário. **Medir derrubou o argumento**, e por duas
 * razões:
 *
 * 1. **O papel não diz isso.** A 15ª limita a taxa a cinco vezes *"o valor do
 *    aluguel de cada peça danificada"*. Onde não há aluguel, a cláusula **não
 *    alcança** o caso — ela não é violada, ela é silente. Recusar ali seria
 *    inventar regra que o instrumento não tem, que é exatamente o que a leitura
 *    do §3º no E211 recusou fazer com a escada de percentuais.
 * 2. **Seria parede diária.** A avaria nasce presa ao BLOQUEIO, não ao contrato,
 *    e o vínculo é frouxo por construção (o véu pendurado na reserva-mãe, a peça
 *    que não é item do contrato). Cobrar uma frase escrita em todo dano desses
 *    trocaria um campo livre por um pedágio.
 *
 * **E não vira silêncio**, que é a outra metade da decisão: o veredicto DIZ que
 * não conferiu (`conferida: false`), a tela mostra isso onde a vendedora digita,
 * e a porta que cria dinheiro grava a linha de trilha — dinheiro nasceu contra
 * um teto que ninguém pôde conferir, e essa frase fica escrita com os números.
 *
 * O que barra é **violação de número que o papel dá**: abaixo dos R$ 350,00 ou
 * acima dos R$ 2.500,00 da 14ª, e acima dos cinco aluguéis da 15ª quando o
 * aluguel existe. Aí sim a régua pede a razão — e continua não impedindo a dona
 * de decidir.
 */
export function avaliarTaxaDeAvaria(params: {
  tipo: TipoDeAvaria;
  valor: number | null | undefined;
  aluguelDaPeca: number | null;
}): VeredictoDaTaxa {
  const faixa = faixaDaTaxaDeAvaria({ tipo: params.tipo, aluguelDaPeca: params.aluguelDaPeca });
  const valor = params.valor ?? null;
  const conferida = !faixa.tetoIndeterminado;

  if (valor === null || valor <= 0) {
    return {
      ...faixa,
      valor,
      // Sem valor não há o que conferir, e não há o que notar: uma avaria sem
      // custo não cobra ninguém e não merece linha de trilha.
      conferida: true,
      dentroDaFaixa: true,
      motivo: null,
      exigeJustificativa: false,
      mereceTrilha: false,
    };
  }

  // Em CENTAVOS, a régua da casa: `1750.5 * 5` em ponto flutuante devolve
  // 8752.499999999999, e o dano de R$ 8.752,50 na peça de R$ 1.750,50 seria
  // recusado por um centavo que não existe.
  const valorC = centavos(valor);
  let motivo: MotivoForaDaFaixa | null = null;
  if (faixa.tetoIndeterminado) motivo = "TETO_INDETERMINADO";
  else if (faixa.piso !== null && valorC < centavos(faixa.piso)) motivo = "ABAIXO_DO_PISO";
  else if (faixa.teto !== null && valorC > centavos(faixa.teto)) motivo = "ACIMA_DO_TETO";

  const violou = motivo === "ABAIXO_DO_PISO" || motivo === "ACIMA_DO_TETO";
  return {
    ...faixa,
    valor,
    conferida,
    dentroDaFaixa: !violou,
    motivo,
    exigeJustificativa: violou,
    mereceTrilha: motivo !== null,
  };
}

/**
 * A frase que a tela mostra e que o 422 devolve — **a mesma**.
 *
 * Duas grafias da mesma explicação divergiriam no dia em que a faixa mudasse, e
 * a vendedora leria na tela um limite que a porta não pratica. É a lição do
 * E211 aplicada ao texto, e não só ao número.
 */
export function explicacaoDaFaixa(v: VeredictoDaTaxa): string {
  if (v.tipo === "LIMPEZA") {
    return (
      `A taxa de limpeza vai de ${brl(TAXA_LIMPEZA_MINIMA)} a ` +
      `${brl(TAXA_LIMPEZA_MAXIMA)} (cláusula 14ª).`
    );
  }
  if (v.tetoIndeterminado) {
    return (
      "Esta peça não está em contrato nenhum, então não há aluguel de onde tirar o teto " +
      `de ${TETO_DO_DANO_EM_ALUGUEIS}× da cláusula 15ª — o valor entra SEM ser conferido.`
    );
  }
  return (
    `O dano não pode passar de ${TETO_DO_DANO_EM_ALUGUEIS}× o aluguel da peça — ` +
    `${brl(v.teto!)} (cláusula 15ª).`
  );
}
