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
 * ## A correção monetária é pelo IPCA (P4, decidida em 15/08/2026) — e só com índice INFORMADO
 *
 * A cláusula manda corrigir e **não nomeia índice**. Até 15/08/2026 a conta
 * declarava a ausência; naquele dia a dona escolheu o **IPCA** (P4). O sistema
 * não tem de onde tirar o índice sozinho, então ele é INFORMADO por competência
 * (`indices_monetarios`, Configurações → Índices), e a convenção é declarada
 * aqui e na frase:
 *
 * - **meses cheios**: corrige-se pelos meses de calendário INTEIROS entre o
 *   vencimento e hoje — do mês seguinte ao do vencimento até o mês anterior ao
 *   de hoje. Vencida há 20 dias, não há mês cheio e não há correção; vencida em
 *   10/03 e lida em 15/08, corrige-se por abril, maio, junho e julho;
 * - **o fator é o produto** `Π(1 + pct/100)` desses meses, sobre o SALDO;
 * - **multa e juros continuam sobre o saldo**, não sobre o corrigido — a
 *   cláusula lista os três lado a lado, e empilhá-los seria inventar ordem;
 * - **mês sem índice informado = sem correção, DITO** com o mês que falta. A
 *   ausência continua sendo a resposta honesta enquanto a dona não digitar o
 *   número; o que mudou é que agora ela sabe qual número falta.
 *
 * O caixa e o carnê não gravam a correção: como a multa e os juros, ela é
 * DERIVADA e nasce no dia do recebimento (`aMora`, E213).
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
  /** A correção monetária pelo IPCA (P4), em reais — 0 quando não há mês cheio ou falta índice. */
  correcao: number;
  /** O que aconteceu com a correção — a frase precisa dizer. */
  correcaoDetalhe: CorrecaoDetalhe;
  /** Multa + juros + correção. */
  acrescimo: number;
  /** Saldo + acréscimo — o que a noiva deve HOJE. */
  total: number;
  /** Em centavos, para quem vai somar. */
  saldoC: number;
  multaC: number;
  jurosC: number;
  correcaoC: number;
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
  /** P4 — o IPCA por competência ("YYYY-MM" → %). Sem ele, a correção fica dita como não informada. */
  indices?: ReadonlyMap<string, number> | null;
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
  const correcao = perdoada
    ? { correcaoC: 0, detalhe: { estado: "sem-tabela", indice: "IPCA" } as CorrecaoDetalhe }
    : correcaoPeloIpca({ saldoC, vencimento, hoje, indices: params.indices });
  const correcaoC = correcao.correcaoC;
  const acrescimoC = multaC + jurosC + correcaoC;
  const totalC = saldoC + acrescimoC;

  return {
    dias,
    saldo: reais(saldoC),
    multa: reais(multaC),
    juros: reais(jurosC),
    correcao: reais(correcaoC),
    correcaoDetalhe: correcao.detalhe,
    acrescimo: reais(acrescimoC),
    total: reais(totalC),
    saldoC,
    multaC,
    jurosC,
    correcaoC,
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
    fraseDaCorrecao(m)
  );
}

/**
 * P4 — a correção monetária pelo IPCA, com o índice INFORMADO por competência.
 *
 * `indices` mapeia `"YYYY-MM"` → variação percentual do mês (o IPCA de abril
 * de 2026 = 0,42 → `{"2026-04": 0.42}`). A conta é pura: quem tem banco
 * carrega o mapa da loja e passa; quem não tem (o teste, o portal em memória)
 * passa o que quiser.
 */
export type CorrecaoDetalhe =
  | { estado: "aplicada"; indice: "IPCA"; meses: string[]; pctAcumulado: number }
  | { estado: "sem-mes-cheio"; indice: "IPCA" }
  | { estado: "falta-indice"; indice: "IPCA"; meses: string[]; faltando: string }
  | { estado: "sem-tabela"; indice: "IPCA" };

/** Os meses de calendário INTEIROS entre o vencimento e hoje ("YYYY-MM"). */
export function mesesCheiosDeMora(vencimentoYMD: string, hojeYMD: string): string[] {
  const [va, vm] = vencimentoYMD.split("-").map(Number) as [number, number];
  const [ha, hm] = hojeYMD.split("-").map(Number) as [number, number];
  const meses: string[] = [];
  let a = va, m = vm + 1;
  if (m > 12) { m = 1; a += 1; }
  while (a < ha || (a === ha && m < hm)) {
    meses.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return meses;
}

export function correcaoPeloIpca(params: {
  saldoC: number;
  vencimento: string;
  hoje: string;
  indices?: ReadonlyMap<string, number> | null;
}): { correcaoC: number; detalhe: CorrecaoDetalhe } {
  if (!params.indices) return { correcaoC: 0, detalhe: { estado: "sem-tabela", indice: "IPCA" } };
  const meses = mesesCheiosDeMora(params.vencimento, params.hoje);
  if (meses.length === 0) return { correcaoC: 0, detalhe: { estado: "sem-mes-cheio", indice: "IPCA" } };
  let fator = 1;
  for (const mes of meses) {
    const pct = params.indices.get(mes);
    if (pct === undefined || !Number.isFinite(pct)) {
      return { correcaoC: 0, detalhe: { estado: "falta-indice", indice: "IPCA", meses, faltando: mes } };
    }
    fator *= 1 + pct / 100;
  }
  const correcaoC = Math.max(0, Math.round(params.saldoC * (fator - 1)));
  return {
    correcaoC,
    detalhe: { estado: "aplicada", indice: "IPCA", meses, pctAcumulado: Math.round((fator - 1) * 10_000) / 100 },
  };
}

/** A frase da correção, na língua da tela — a mesma para todos os leitores. */
export function fraseDaCorrecao(m: Pick<Mora, "correcao" | "correcaoDetalhe">): string {
  const d = m.correcaoDetalhe;
  const mesBR = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
  switch (d.estado) {
    case "aplicada":
      return `Correção pelo IPCA de ${mesBR(d.meses[0]!)} a ${mesBR(d.meses[d.meses.length - 1]!)} (${d.pctAcumulado.toLocaleString("pt-BR")}%) = ${brl(m.correcao)}.`;
    case "sem-mes-cheio":
      return `Sem correção monetária — ainda não há mês cheio de atraso (IPCA, meses inteiros entre o vencimento e hoje).`;
    case "falta-indice":
      return `Sem correção monetária — o IPCA de ${mesBR(d.faltando)} não foi informado (Configurações → Índices).`;
    case "sem-tabela":
      return `Sem correção monetária — índice não informado.`;
  }
}
