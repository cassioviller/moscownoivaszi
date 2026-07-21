import type { ComissaoFechamento } from "@workspace/api-client-react";
import { centavos, reais } from "@/lib/financeiro/dinheiro";

/**
 * O custo de comissão como linha do tempo (E52).
 *
 * Todo `comissao_fechamentos` já guarda totalVendas/valorTotal/percentualAplicado
 * desde o E23, e nenhuma tela agregava: o dono via o mês corrente e nunca a
 * TENDÊNCIA — nem se a taxa efetiva está subindo. Aqui não há recálculo nenhum;
 * é soma sobre dado persistido, e por isso o número desta tela não pode
 * divergir do que foi de fato pago.
 *
 * Agrega no cliente de propósito: a lista de fechamentos já é buscada pela
 * mesma tela e é pequena por natureza (uma linha por vendedora por mês), então
 * um endpoint de agregação só criaria uma segunda fonte para o mesmo número.
 */

export type PontoSerieComissao = {
  competencia: string;
  totalVendas: number;
  custoComissao: number;
  /** % do faturamento que virou comissão. null quando não houve venda. */
  taxaEfetiva: number | null;
  vendedoras: number;
};

export type SerieComissao = {
  /** Da competência mais antiga para a mais recente. */
  pontos: PontoSerieComissao[];
  totalVendas: number;
  custoTotal: number;
  /** A taxa do PERÍODO INTEIRO — ver a nota sobre a média enganosa. */
  taxaEfetivaMedia: number | null;
};

/** Taxa efetiva em %, com uma casa. Sem venda não há taxa (não é zero). */
function taxa(custoC: number, vendasC: number): number | null {
  if (vendasC <= 0) return null;
  return Math.round((custoC / vendasC) * 1000) / 10;
}

/**
 * Série por competência a partir dos fechamentos.
 *
 * Competência SEM fechamento não entra — e isso é diferente de entrar zerada.
 * Um mês ainda não fechado custou comissão sim; ela só não foi apurada. Mostrá-lo
 * como "R$ 0 de custo" faria o dono ler "esse mês não me custou nada", que é
 * exatamente a conclusão errada. A série cobre os meses fechados, e só.
 */
export function serieDeComissao(
  fechamentos: readonly ComissaoFechamento[],
  opts: { meses: number },
): SerieComissao {
  const porComp = new Map<string, { vendasC: number; custoC: number; vendedoras: number }>();

  for (const f of fechamentos) {
    const atual = porComp.get(f.competencia) ?? { vendasC: 0, custoC: 0, vendedoras: 0 };
    atual.vendasC += centavos(f.totalVendas);
    atual.custoC += centavos(f.valorTotal);
    atual.vendedoras += 1;
    porComp.set(f.competencia, atual);
  }

  const todas = [...porComp.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // As N mais RECENTES, ainda em ordem cronológica: a leitura é da esquerda
  // para a direita, mas o corte é pelo fim.
  const janela = todas.slice(Math.max(0, todas.length - Math.max(1, opts.meses)));

  const pontos = janela.map(([competencia, { vendasC, custoC, vendedoras }]) => ({
    competencia,
    totalVendas: reais(vendasC),
    custoComissao: reais(custoC),
    taxaEfetiva: taxa(custoC, vendasC),
    vendedoras,
  }));

  const vendasTotaisC = janela.reduce((s, [, v]) => s + v.vendasC, 0);
  const custoTotalC = janela.reduce((s, [, v]) => s + v.custoC, 0);

  return {
    pontos,
    totalVendas: reais(vendasTotaisC),
    custoTotal: reais(custoTotalC),
    // SUM(comissão)/SUM(vendas) — NÃO a média das taxas mensais. Um mês de
    // R$ 2 mil com taxa alta pesaria igual a um de R$ 200 mil na média
    // simples, e a resposta sairia errada justamente quando mais importa.
    taxaEfetivaMedia: taxa(custoTotalC, vendasTotaisC),
  };
}
