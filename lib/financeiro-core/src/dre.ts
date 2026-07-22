import { centavos, reais } from "./dinheiro";
import { entradasDoIntervalo, saidasDoIntervalo, type ParcelaPaga, type SaidaCaixa } from "./caixa";
import type { Intervalo } from "./datas";

/**
 * DRE simples, REGIME DE CAIXA (E79): receitas (parcela paga) − despesas por
 * categoria (itens dos pagamentos) = resultado. Vale o que se moveu, não o
 * que foi prometido — por isso reusa os MESMOS filtros do caixa: fluxo e DRE
 * têm que fechar entre si, e fecham porque saem do mesmo motor.
 *
 * Nasceu no frontend (lib/financeiro/dre.ts) e subiu para o core quando o
 * endpoint GET /financeiro/dre passou a agregá-lo no servidor — o padrão E25.
 */

/**
 * Espelha `contaPagarTipoEnum`. Chaves LITERAIS de propósito: o cliente fixa a
 * cobertura contra o enum gerado via typecheck (`Record<ContaPagarTipo, …>`).
 */
export const ROTULO_TIPO = {
  DESPESA: "Despesas",
  FORNECEDOR: "Fornecedores",
  SALARIO: "Salários",
  COMISSAO: "Comissões",
} as const;

/** A categoria livre quando houver; senão o rótulo do tipo. */
export function rotuloCategoria(categoria: string | null | undefined, tipo: string): string {
  return (
    categoria?.trim() || (ROTULO_TIPO as Record<string, string>)[tipo] || ROTULO_TIPO.DESPESA
  );
}

/** A linha do drizzle e o objeto da API entram igual (estrutural, como caixa.ts). */
export type ItemSaida = {
  valor: number;
  contaPagar?: { categoria?: string | null; tipo: string } | null;
};

export type SaidaComItens = SaidaCaixa & { itens?: readonly ItemSaida[] | null };

export type LinhaDespesa = { rotulo: string; total: number };
export type DRE = {
  receitas: number;
  /** Maior total primeiro. */
  despesas: LinhaDespesa[];
  totalDespesas: number;
  /** receitas − totalDespesas; pode ser negativo. */
  resultado: number;
};

export function dreDoIntervalo(
  parcelas: readonly ParcelaPaga[],
  pagamentos: readonly SaidaComItens[],
  intervalo: Intervalo,
): DRE {
  const receitasC = entradasDoIntervalo(parcelas, intervalo)
    .reduce((s, p) => s + centavos(p.valorRecebido ?? 0), 0);

  const porCategoria = new Map<string, number>();
  for (const pg of saidasDoIntervalo(pagamentos, intervalo)) {
    for (const item of pg.itens ?? []) {
      const conta = item.contaPagar;
      // Saída sem conta identificada ainda é dinheiro que saiu: cai em "Despesas".
      const rotulo = conta ? rotuloCategoria(conta.categoria, conta.tipo) : ROTULO_TIPO.DESPESA;
      porCategoria.set(rotulo, (porCategoria.get(rotulo) ?? 0) + centavos(item.valor));
    }
  }

  const despesas = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, c]) => ({ rotulo, total: reais(c) }));
  const totalDespesasC = [...porCategoria.values()].reduce((s, c) => s + c, 0);

  return {
    receitas: reais(receitasC),
    despesas,
    totalDespesas: reais(totalDespesasC),
    resultado: reais(receitasC - totalDespesasC),
  };
}
