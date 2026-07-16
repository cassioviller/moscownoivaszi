import type { Parcela, Pagamento } from "@workspace/api-client-react";
import { centavos, reais } from "./dinheiro";
import { diaLocal, ultimasCompetencias, type Intervalo, instanteNoIntervalo } from "./datas";

/**
 * Fluxo de caixa — o dinheiro que DE FATO se moveu, nunca o previsto.
 * Entradas: parcela PAGA, pela data do recebimento. Saídas: pagamento, pela
 * data da saída. Ambas são INSTANTES, então tudo aqui agrupa por dia LOCAL
 * (ver datas.ts) — o caixa de um dia é o que a loja movimentou naquele dia.
 *
 * Não é extrato bancário: sem saldo inicial e sem conciliação. O previsto vive
 * separado, como horizonte, para nunca ser somado ao realizado por engano.
 */

export type ResumoCaixa = {
  /** Reais. */
  entradas: number;
  saidas: number;
  /** Pode ser negativo. */
  saldo: number;
};

export type Movimento = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  data: string;
  valor: number;
  descricao: string;
  /** Quem/o quê, quando dá para nomear (noiva, colaborador, fornecedor). */
  rotulo: string | null;
  /** Destino do clique, quando existe uma tela que explica o movimento. */
  href: string | null;
};

export type PontoTendencia = { competencia: string; entradas: number; saidas: number; saldo: number };

/** Parcelas efetivamente recebidas dentro do intervalo. */
export function entradasDoIntervalo(parcelas: readonly Parcela[], intervalo: Intervalo): Parcela[] {
  return parcelas.filter(
    (p) => p.status === "PAGA" && !!p.recebidoEm && instanteNoIntervalo(p.recebidoEm, intervalo),
  );
}

/** Saídas de caixa dentro do intervalo. */
export function saidasDoIntervalo(pagamentos: readonly Pagamento[], intervalo: Intervalo): Pagamento[] {
  return pagamentos.filter((pg) => instanteNoIntervalo(pg.data, intervalo));
}

export function resumoCaixa(
  parcelas: readonly Parcela[],
  pagamentos: readonly Pagamento[],
  intervalo: Intervalo,
): ResumoCaixa {
  const entradasC = entradasDoIntervalo(parcelas, intervalo)
    .reduce((s, p) => s + centavos(p.valorRecebido ?? 0), 0);
  const saidasC = saidasDoIntervalo(pagamentos, intervalo)
    .reduce((s, pg) => s + centavos(pg.valorPago), 0);
  return { entradas: reais(entradasC), saidas: reais(saidasC), saldo: reais(entradasC - saidasC) };
}

/** Rótulo de uma parcela na linha do tempo. */
function descricaoParcela(p: Parcela): string {
  return p.descricao || (p.numero === 0 ? "Entrada/sinal" : `Parcela ${p.numero}`);
}

/**
 * Linha do tempo unificada do intervalo, mais recente primeiro.
 * `nomePorContrato` resolve a noiva: a lista de parcelas do financeiro já vem
 * com o contrato e o lead aninhados, mas quem chama decide como nomear.
 */
export function movimentos(
  parcelas: readonly Parcela[],
  pagamentos: readonly Pagamento[],
  intervalo: Intervalo,
  ctx: { lojaId: string; nomeDaNoiva?: (p: Parcela) => string | null },
): Movimento[] {
  const entradas: Movimento[] = entradasDoIntervalo(parcelas, intervalo).map((p) => ({
    id: `parcela-${p.id}`,
    tipo: "ENTRADA" as const,
    data: p.recebidoEm!, // garantido pelo filtro
    valor: p.valorRecebido ?? 0,
    descricao: descricaoParcela(p),
    rotulo: ctx.nomeDaNoiva?.(p) ?? null,
    href: `/loja/${ctx.lojaId}/contratos/${p.contratoId}`,
  }));

  const saidas: Movimento[] = saidasDoIntervalo(pagamentos, intervalo).map((pg) => {
    const contas = (pg.itens ?? []).map((i) => i.contaPagar).filter((c): c is NonNullable<typeof c> => !!c);
    return {
      id: `pagamento-${pg.id}`,
      tipo: "SAIDA" as const,
      data: pg.data,
      valor: pg.valorPago,
      descricao: contas.length > 0 ? contas.map((c) => c.descricao).join(" · ") : "Pagamento",
      rotulo:
        pg.colaborador?.nome ??
        contas.find((c) => c.fornecedor)?.fornecedor ??
        contas.find((c) => c.categoria)?.categoria ??
        null,
      href: `/loja/${ctx.lojaId}/financeiro/pagar`,
    };
  });

  return [...entradas, ...saidas].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
  );
}

/**
 * Saldo por mês dos últimos N meses, do mais antigo ao mais recente. Mês sem
 * movimento aparece zerado — a série precisa ser contínua para virar curva.
 */
export function tendenciaCaixa(
  parcelas: readonly Parcela[],
  pagamentos: readonly Pagamento[],
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
    if (p.status !== "PAGA" || !p.recebidoEm) continue;
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
