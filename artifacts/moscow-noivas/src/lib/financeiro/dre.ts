import type { Parcela, Pagamento, ContaPagarTipo } from "@workspace/api-client-react";
import { centavos, reais } from "./dinheiro";
import { entradasDoIntervalo, saidasDoIntervalo } from "./fluxo";
import type { Intervalo } from "./datas";

/**
 * DRE simples, REGIME DE CAIXA: receitas (parcela paga) − despesas por
 * categoria (itens dos pagamentos) = resultado. Vale o que se moveu, não o
 * que foi prometido — por isso reusa os mesmos filtros do fluxo: os dois
 * números têm que fechar entre si.
 */

const ROTULO_TIPO: Record<ContaPagarTipo, string> = {
  DESPESA: "Despesas",
  FORNECEDOR: "Fornecedores",
  SALARIO: "Salários",
  COMISSAO: "Comissões",
};

/** A categoria livre quando houver; senão o rótulo do tipo. */
export function rotuloCategoria(categoria: string | null | undefined, tipo: ContaPagarTipo): string {
  return categoria?.trim() || ROTULO_TIPO[tipo];
}

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
  parcelas: readonly Parcela[],
  pagamentos: readonly Pagamento[],
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
