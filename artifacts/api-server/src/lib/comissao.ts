/**
 * Motor de comissão — puro, testável sem banco.
 *
 * Duas decisões de produto moram aqui, e as duas são contraintuitivas:
 *
 * 1. **RETROATIVO.** A faixa do acumulado FINAL rege o mês inteiro. Vendeu
 *    80 mil e a faixa dos 80 mil paga 6%? Os 80 mil inteiros pagam 6% — não é
 *    progressivo por degrau como imposto de renda. Bater a faixa vale a pena
 *    até o último dia do mês, que é exatamente o incentivo pretendido.
 *
 * 2. **Buraco é zero, não a faixa de baixo.** Se nenhuma faixa contém o
 *    acumulado (ex.: abaixo do primeiro patamar), não há comissão. Buracos são
 *    permitidos de propósito — "abaixo de 20 mil não comissiona" se escreve
 *    simplesmente não criando faixa ali.
 *
 * Tudo em CENTAVOS INTEIROS; percentual é número (5 = 5%). O acumulado pode
 * chegar negativo pelo estorno §6.4 (cancelamento de mês já fechado) — nesse
 * caso não há comissão nem bônus, e o excedente é problema de quem chama.
 */

export type FaixaCalc = {
  /** Centavos. Borda inferior INCLUSIVA. */
  minAcumulado: number;
  /** Centavos. Borda superior EXCLUSIVA; null = topo aberto. */
  maxAcumulado: number | null;
  /** % (5 = 5%). null/0 = faixa que só paga bônus. */
  percentual: number | null;
  /** Centavos. null/0 = faixa que só paga percentual. */
  bonusFixo: number | null;
};

export type ResultadoComissao = {
  /** Índice na lista ORDENADA; null se nenhuma faixa pegou. */
  faixaIndex: number | null;
  percentualAplicado: number | null;
  /** Centavos. */
  valorComissao: number;
  valorBonus: number;
  /** Centavos. = comissão + bônus, nunca negativo. */
  valorTotal: number;
};

const ZERO: ResultadoComissao = {
  faixaIndex: null,
  percentualAplicado: null,
  valorComissao: 0,
  valorBonus: 0,
  valorTotal: 0,
};

export function ordenarFaixas(faixas: readonly FaixaCalc[]): FaixaCalc[] {
  return [...faixas].sort((a, b) => a.minAcumulado - b.minAcumulado);
}

/**
 * Aplica as faixas sobre o acumulado.
 *
 * `bonusAcumulaFaixas` decide o bônus: ligado, soma o bônus de TODA faixa já
 * atingida (os degraus se somam); desligado, só o da faixa final vale.
 */
export function calcularComissao(
  totalVendas: number,
  faixas: readonly FaixaCalc[],
  bonusAcumulaFaixas: boolean,
): ResultadoComissao {
  if (totalVendas <= 0) return ZERO;

  const ord = ordenarFaixas(faixas);
  const idx = ord.findIndex(
    (f) => totalVendas >= f.minAcumulado && (f.maxAcumulado === null || totalVendas < f.maxAcumulado),
  );
  if (idx === -1) return ZERO; // buraco: nenhuma faixa contém o acumulado

  const faixaFinal = ord[idx];
  const pct = faixaFinal.percentual ?? null;
  const valorComissao = pct ? Math.round((totalVendas * pct) / 100) : 0;

  const atingidas = bonusAcumulaFaixas ? ord.filter((f) => f.minAcumulado <= totalVendas) : [faixaFinal];
  const valorBonus = atingidas.reduce((s, f) => s + (f.bonusFixo ?? 0), 0);

  return {
    faixaIndex: idx,
    percentualAplicado: pct,
    valorComissao,
    valorBonus,
    valorTotal: Math.max(0, valorComissao + valorBonus),
  };
}

export type MotivoFaixasInvalidas =
  | "sem_faixas"
  | "min_negativo"
  | "intervalo_invalido"
  | "faixa_vazia"
  | "valor_negativo"
  | "aberta_no_meio"
  | "sobreposicao";

export type ResultadoValidacao = { ok: true } | { ok: false; motivo: MotivoFaixasInvalidas };

/**
 * Faixas coerentes: ao menos uma; min ≥ 0; max > min (ou aberta); cada faixa
 * paga percentual OU bônus (senão não é faixa, é enfeite); sem sobreposição; só
 * a do topo pode ser aberta.
 *
 * BURACOS SÃO VÁLIDOS: um intervalo sem faixa significa "não comissiona aqui".
 * Sobreposição, não — duas faixas contendo o mesmo acumulado tornam a comissão
 * ambígua, e ambiguidade em dinheiro de vendedora vira discussão no fim do mês.
 */
export function validarFaixas(faixas: readonly FaixaCalc[]): ResultadoValidacao {
  if (faixas.length === 0) return { ok: false, motivo: "sem_faixas" };
  const ord = ordenarFaixas(faixas);

  for (let i = 0; i < ord.length; i++) {
    const f = ord[i];
    if (!(f.minAcumulado >= 0)) return { ok: false, motivo: "min_negativo" };
    if (f.maxAcumulado !== null && !(f.maxAcumulado > f.minAcumulado)) {
      return { ok: false, motivo: "intervalo_invalido" };
    }
    if ((f.percentual ?? 0) < 0 || (f.bonusFixo ?? 0) < 0) return { ok: false, motivo: "valor_negativo" };
    if ((f.percentual ?? 0) <= 0 && (f.bonusFixo ?? 0) <= 0) return { ok: false, motivo: "faixa_vazia" };
    if (f.maxAcumulado === null && i !== ord.length - 1) return { ok: false, motivo: "aberta_no_meio" };
    if (i > 0) {
      const anterior = ord[i - 1];
      if (anterior.maxAcumulado === null) return { ok: false, motivo: "aberta_no_meio" };
      if (f.minAcumulado < anterior.maxAcumulado) return { ok: false, motivo: "sobreposicao" };
    }
  }
  return { ok: true };
}

/** O degrau seguinte e o quanto falta para alcançá-lo. null se já está no topo. */
export function proximoDegrau(
  totalVendas: number,
  faixas: readonly FaixaCalc[],
): { faltam: number; percentual: number | null; bonusFixo: number | null } | null {
  const acima = ordenarFaixas(faixas).find((f) => f.minAcumulado > totalVendas);
  if (!acima) return null;
  return {
    faltam: acima.minAcumulado - totalVendas,
    percentual: acima.percentual ?? null,
    bonusFixo: acima.bonusFixo ?? null,
  };
}

/**
 * Quantos dias de mês já se passaram antes de a projeção valer alguma coisa.
 *
 * No dia 2, um run-rate diz "no seu ritmo você fecha em 15x o que vendeu
 * ontem" — isso não é previsão, é ruído com cara de número. E número na tela é
 * acreditado, por mais ressalva que tenha ao lado. Abaixo disso a projeção não
 * existe, e a tela diz que ainda é cedo.
 */
export const MIN_DIAS_PROJECAO = 5;

export type ProjecaoCompetencia = {
  diasDecorridos: number;
  diasNoMes: number;
  /** Centavos — a base líquida que o mês deve fechar no ritmo atual. */
  baseProjetadaC: number;
};

/**
 * "No seu ritmo, o mês fecha em quanto?" (E51)
 *
 * Run-rate simples: as vendas do mês até agora esticadas para o mês inteiro.
 * Só faz sentido para a competência CORRENTE — num mês passado não há ritmo a
 * projetar, o total já é o total, e mostrar projeção ali seria inventar futuro
 * para algo que acabou. Devolve null nesse caso e antes de `MIN_DIAS_PROJECAO`.
 *
 * O ESTORNO não é esticado, e essa é a sutileza: ele é um evento único (um
 * cancelamento de mês fechado), não um ritmo. Projetá-lo junto multiplicaria um
 * acidente por 30 e diria à vendedora que ela vai devolver dinheiro que já
 * devolveu. Estica-se a VENDA; o estorno se abate uma vez, no fim.
 */
export function projetarCompetencia(
  vendasC: number,
  estornoC: number,
  competencia: string,
  agora: Date,
): ProjecaoCompetencia | null {
  if (competenciaDe(agora) !== competencia) return null;

  const { inicio, fim } = limitesCompetencia(competencia);
  const MS_DIA = 86_400_000;
  const diasNoMes = Math.round((fim.getTime() - inicio.getTime()) / MS_DIA);
  // Dia do mês no fuso da loja: o mesmo deslocamento de `competenciaDe`.
  const diasDecorridos = new Date(agora.getTime() - 3 * 60 * 60 * 1000).getUTCDate();

  if (diasDecorridos < MIN_DIAS_PROJECAO) return null;

  return {
    diasDecorridos,
    diasNoMes,
    baseProjetadaC: Math.round((vendasC * diasNoMes) / diasDecorridos) - estornoC,
  };
}

// ── Competência (America/Sao_Paulo, offset fixo -03:00 — sem DST desde 2019) ──
// Este módulo é puro de propósito (unit sem banco), então não importa o
// inicioDoDia de disponibilidade.ts, que arrasta os tipos de db junto.

/** Início (inclusivo) e fim (exclusivo) da competência "YYYY-MM". */
export function limitesCompetencia(competencia: string): { inicio: Date; fim: Date } {
  const [ano, mes] = competencia.split("-").map(Number);
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    inicio: new Date(`${ano}-${pad(mes)}-01T00:00:00-03:00`),
    fim: new Date(`${proximoAno}-${pad(proximoMes)}-01T00:00:00-03:00`),
  };
}

export function competenciaValida(competencia: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(competencia)) return false;
  const mes = Number(competencia.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

/** A competência de um instante, no fuso da loja. */
export function competenciaDe(instante: Date): string {
  return new Date(instante.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** Vencimento da conta de comissão: dia 5 do mês seguinte à competência. */
export function vencimentoComissao(competencia: string): Date {
  const { fim } = limitesCompetencia(competencia);
  const ano = fim.toISOString().slice(0, 4);
  const mes = fim.toISOString().slice(5, 7);
  return new Date(`${ano}-${mes}-05T12:00:00-03:00`);
}
