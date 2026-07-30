import { centavos, reais } from "./dinheiro";
import { diaLocal, diaDeNegocio, hojeLocal, ultimasCompetencias, instanteNoIntervalo, type Intervalo } from "./datas";

/**
 * O motor de caixa (E25) — as agregações que antes viviam só no frontend
 * (fluxo.ts/forma.ts) e que o backend reimplementava do seu jeito em SQL,
 * podendo divergir por centavos e por UM DIA (instante vs dia de negócio).
 * Tipos ESTRUTURAIS de propósito: a linha do drizzle (Date) e o objeto da API
 * (string) entram igual — o motor não conhece nenhum dos dois lados.
 *
 * Entradas: parcela PAGA, pela data do recebimento. Saídas: pagamento, pela
 * data da saída. Ambas são INSTANTES → dia LOCAL São Paulo. Obrigações
 * previstas (vencimento) são DATA DE NEGÓCIO ancorada ao meio-dia SP.
 */

export type ParcelaPaga = {
  status: string;
  recebidoEm?: string | Date | null;
  valorRecebido?: number | null;
};

export type SaidaCaixa = {
  data: string | Date;
  valorPago: number;
};

export type ObrigacaoPrevista = {
  status: string;
  vencimento: string | Date;
  valorPrevisto: number;
  /** Já recebido nesta obrigação (E49). Ausente = nada recebido. */
  valorRecebido?: number | null;
};

/**
 * A lista de status ABERTO, para quem precisa filtrar ANTES de ter o objeto —
 * isto é, no SQL (C4/E94).
 *
 * O predicado `estaAberta` só serve depois do SELECT, em memória. Quem monta um
 * `WHERE` precisa da lista, e por não existir uma cada rota reescrevia a sua à
 * mão: o `/financeiro/fluxo` acertou (`["PREVISTA","PARCIAL"]`), o
 * `/alerta-caixa` escreveu `eq(status,'PAGA')` e `eq(status,'PREVISTA')` e
 * perdeu a parcela meio recebida das DUAS pernas, e o dashboard repetiu o mesmo
 * esquecimento numa terceira query. Três cópias da mesma regra, uma delas certa.
 *
 * Exportar a lista e derivar o predicado dela é o que impede a quarta cópia:
 * agora só existe um lugar onde a resposta muda.
 */
export const STATUS_ABERTO = ["PREVISTA", "PARCIAL"] as const;

/**
 * Uma obrigação segue ABERTA enquanto sobra saldo — PREVISTA ou PARCIAL (E49).
 *
 * Antes "aberta" era `status === "PREVISTA"`, e a parcela meio paga sumia do
 * horizonte, do aging e da projeção com dinheiro ainda a receber. Toda leitura
 * de "o que falta" passa por aqui: uma régua só, num lugar só.
 */
export function estaAberta(obrigacao: { status: string }): boolean {
  return (STATUS_ABERTO as readonly string[]).includes(obrigacao.status);
}

/**
 * Uma obrigação ENTROU no caixa quando algum dinheiro dela chegou — e a
 * pergunta é ao RECEBIMENTO, não ao status (E115/S5).
 *
 * Até o E115 isto era a lista `["PAGA","PARCIAL"]`, e ela mentia num caso que
 * custa dinheiro: cancelar um contrato com `destinoPago: "manter"` vira a
 * PARCIAL em CANCELADA **preservando** `valorRecebido` — "o valor fica no
 * caixa" é o contrato documentado do `manter` —, e a lista tirava esses reais
 * do fluxo, do DRE e da tendência RETROATIVAMENTE, no dia em que entraram. O
 * extrato do banco continuava mostrando o movimento; o mês parava de bater.
 *
 * O estorno (avulso ou em massa) zera `valorRecebido`/`recebidoEm`, então a
 * mesma pergunta responde "não" para o que foi devolvido. Não existe mais
 * lista de status para o recebimento: quem precisa disso no SQL filtra por
 * `recebido_em IS NOT NULL` — que é o que fluxo e DRE já faziam.
 */
export function teveRecebimento(obrigacao: {
  recebidoEm?: string | Date | null;
  valorRecebido?: number | null;
}): boolean {
  return obrigacao.recebidoEm != null && centavos(obrigacao.valorRecebido ?? 0) > 0;
}

/** Centavos que ainda faltam. Nunca negativo — pagar a mais não vira crédito. */
function saldoAbertoC(o: ObrigacaoPrevista): number {
  return Math.max(0, centavos(o.valorPrevisto) - centavos(o.valorRecebido ?? 0));
}

/**
 * O que ainda falta receber/pagar nesta obrigação, em reais. É este valor — e
 * não o previsto — que entra no aging, no horizonte e na projeção: cobrar de
 * novo o que já foi pago é o erro que a noiva percebe primeiro.
 */
export function saldoAberto(o: ObrigacaoPrevista): number {
  return reais(saldoAbertoC(o));
}

export type ResumoCaixa = {
  /** Reais. */
  entradas: number;
  saidas: number;
  /** Pode ser negativo. */
  saldo: number;
};

/** Parcelas com dinheiro efetivamente recebido dentro do intervalo. */
export function entradasDoIntervalo<T extends ParcelaPaga>(parcelas: readonly T[], intervalo: Intervalo): T[] {
  return parcelas.filter(
    (p) => teveRecebimento(p) && !!p.recebidoEm && instanteNoIntervalo(p.recebidoEm, intervalo),
  );
}

/** Saídas de caixa dentro do intervalo. */
export function saidasDoIntervalo<T extends SaidaCaixa>(pagamentos: readonly T[], intervalo: Intervalo): T[] {
  return pagamentos.filter((pg) => instanteNoIntervalo(pg.data, intervalo));
}

export function resumoCaixa(
  parcelas: readonly ParcelaPaga[],
  pagamentos: readonly SaidaCaixa[],
  intervalo: Intervalo,
): ResumoCaixa {
  const entradasC = entradasDoIntervalo(parcelas, intervalo)
    .reduce((s, p) => s + centavos(p.valorRecebido ?? 0), 0);
  const saidasC = saidasDoIntervalo(pagamentos, intervalo)
    .reduce((s, pg) => s + centavos(pg.valorPago), 0);
  return { entradas: reais(entradasC), saidas: reais(saidasC), saldo: reais(entradasC - saidasC) };
}

export type ParcelaPagaComMeio = ParcelaPaga & { formaRecebimento?: string | null };

export type LinhaPorMeio = {
  /** O código cru (chave estável) ou null para o que não tem forma registrada. */
  forma: string | null;
  total: number;
  qtd: number;
};

export type PorMeio = { total: number; linhas: LinhaPorMeio[] };

/**
 * As MESMAS entradas do resumo, agrupadas pelo MEIO (E50) — soma em centavos
 * inteiros, então `total === resumoCaixa(...).entradas` por construção. Maior
 * total primeiro; o sem-forma (null) sempre por último. O rótulo PT-BR é
 * vocabulário de tela; aqui fala-se o código cru.
 */
export function entradasPorMeio(
  parcelas: readonly ParcelaPagaComMeio[],
  intervalo: Intervalo,
): PorMeio {
  const porForma = new Map<string | null, { totalC: number; qtd: number }>();
  let totalC = 0;
  for (const p of entradasDoIntervalo(parcelas, intervalo)) {
    const c = centavos(p.valorRecebido ?? 0);
    totalC += c;
    const chave = p.formaRecebimento ?? null;
    const atual = porForma.get(chave) ?? { totalC: 0, qtd: 0 };
    atual.totalC += c;
    atual.qtd += 1;
    porForma.set(chave, atual);
  }
  const linhas = [...porForma.entries()]
    .map(([forma, agg]) => ({ forma, total: reais(agg.totalC), qtd: agg.qtd }))
    .sort((a, b) => {
      if (a.forma === null) return 1;
      if (b.forma === null) return -1;
      return b.total - a.total;
    });
  return { total: reais(totalC), linhas };
}

export type PontoTendencia = { competencia: string; entradas: number; saidas: number; saldo: number };

/**
 * Saldo por mês dos últimos N meses, do mais antigo ao mais recente. Mês sem
 * movimento aparece zerado — a série precisa ser contínua para virar curva.
 */
export function tendenciaCaixa(
  parcelas: readonly ParcelaPaga[],
  pagamentos: readonly SaidaCaixa[],
  opts: { meses: number; ate: string },
): PontoTendencia[] {
  const meses = Math.max(1, Math.min(24, opts.meses));
  const comps = ultimasCompetencias(opts.ate, meses);

  const porMes = new Map<string, { ent: number; sai: number }>();
  const bucket = (chave: string) => {
    let b = porMes.get(chave);
    if (!b) porMes.set(chave, (b = { ent: 0, sai: 0 }));
    return b;
  };
  for (const p of parcelas) {
    if (!teveRecebimento(p) || !p.recebidoEm) continue;
    bucket(diaLocal(p.recebidoEm).slice(0, 7)).ent += centavos(p.valorRecebido ?? 0);
  }
  for (const pg of pagamentos) {
    bucket(diaLocal(pg.data).slice(0, 7)).sai += centavos(pg.valorPago);
  }

  return comps.map((competencia) => {
    const { ent, sai } = porMes.get(competencia) ?? { ent: 0, sai: 0 };
    return { competencia, entradas: reais(ent), saidas: reais(sai), saldo: reais(ent - sai) };
  });
}

/**
 * Uma obrigação está ATRASADA quando ainda está ABERTA (PREVISTA ou PARCIAL) e
 * o vencimento já passou. Derivado, nunca gravado: o status no banco não sabe
 * que dia é hoje.
 */
export function estaAtrasada(obrigacao: ObrigacaoPrevista, hoje: string = hojeLocal()): boolean {
  return estaAberta(obrigacao) && diaDeNegocio(obrigacao.vencimento) < hoje;
}

export type Vencidas = { qtd: number; total: number };

/** Total em aberto e já vencido — o SALDO, não o previsto (E49). */
export function vencidas(obrigacoes: readonly ObrigacaoPrevista[], hoje: string = hojeLocal()): Vencidas {
  const atrasadas = obrigacoes.filter((o) => estaAtrasada(o, hoje));
  return {
    qtd: atrasadas.length,
    total: reais(atrasadas.reduce((s, o) => s + saldoAbertoC(o), 0)),
  };
}

export type HorizonteAberto = {
  /** Reais. */
  aReceber: number;
  aReceberAtraso: number;
  aPagar: number;
  aPagarAtraso: number;
};

/**
 * O que está em aberto, pelo VENCIMENTO — previsão, não caixa. O atraso é o
 * subconjunto já vencido, então `aReceberAtraso <= aReceber` sempre.
 */
export function horizonteAberto(
  parcelas: readonly ObrigacaoPrevista[],
  contas: readonly ObrigacaoPrevista[],
  hoje: string = hojeLocal(),
): HorizonteAberto {
  return {
    aReceber: reais(abertoEmCentavos(parcelas)),
    aReceberAtraso: vencidas(parcelas, hoje).total,
    aPagar: reais(abertoEmCentavos(contas)),
    aPagarAtraso: vencidas(contas, hoje).total,
  };
}

/**
 * Soma do SALDO do que segue aberto — quitado ou cancelado saiu do horizonte.
 *
 * Exportada desde o E125: é O saldo devedor de um contrato ("falta receber",
 * na tela da loja; "falta pagar", no portal da noiva). A conta existia aqui
 * (privada), no diálogo de cancelar do contrato e no portal — três escritas do
 * mesmo número, que é a classe de defeito mais cara do repo. Agora é uma.
 */
export function abertoEmCentavos(itens: readonly ObrigacaoPrevista[]): number {
  return itens.reduce((s, i) => (estaAberta(i) ? s + saldoAbertoC(i) : s), 0);
}

/**
 * O previsto (PREVISTA) com vencimento DENTRO da janela, por dia de negócio e
 * em centavos — a régua única do "a receber/pagar nos próximos N dias" que o
 * dashboard somava em SQL por instante (excluindo o vencimento de hoje ao
 * meio-dia quando a consulta rodava à tarde) e o frontend somava por dia.
 */
export function previstoNaJanela(
  obrigacoes: readonly ObrigacaoPrevista[],
  janela: Intervalo,
): number {
  const soma = obrigacoes.reduce((s, o) => {
    if (!estaAberta(o)) return s;
    const dia = diaDeNegocio(o.vencimento);
    return dia >= janela.iniYMD && dia <= janela.fimYMD ? s + saldoAbertoC(o) : s;
  }, 0);
  return reais(soma);
}
