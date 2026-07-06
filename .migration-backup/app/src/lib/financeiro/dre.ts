// src/lib/financeiro/dre.ts
// DRE simples (regime de caixa): receitas (parcela PAGA por recebidoEm) − despesas por categoria
// (PagamentoItem por pagamento.data, agrupado por categoria/tipo) = resultado do mês. Leitura pura.
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { deCentavos, decParaCentavos } from "@/lib/dinheiro";
import { competenciaValida, competenciaRange } from "@/lib/financeiro/datas";
import type { ContaPagarTipo } from "@/generated/prisma/client";

const ROTULO_TIPO: Record<ContaPagarTipo, string> = {
  DESPESA: "Despesas",
  FORNECEDOR: "Fornecedores",
  SALARIO: "Salários",
  COMISSAO: "Comissões",
};

/** Rótulo da despesa: a categoria livre quando houver; senão o rótulo do tipo. Puro. */
export function rotuloCategoria(categoria: string | null, tipo: ContaPagarTipo): string {
  const c = categoria?.trim();
  return c ? c : ROTULO_TIPO[tipo];
}

export type LinhaDespesa = { rotulo: string; total: string };
export type DRE = {
  competencia: string;
  receitas: string;
  despesas: LinhaDespesa[]; // maior total primeiro
  totalDespesas: string;
  resultado: string; // receitas − totalDespesas (pode ser negativo)
};

const zero = (competencia: string): DRE => ({ competencia, receitas: "0.00", despesas: [], totalDespesas: "0.00", resultado: "0.00" });

/** DRE realizado do mês: receitas − despesas por categoria. Competência inválida → zerado. */
export async function dreDoMes(lojaId: string, competencia: string): Promise<DRE> {
  if (!competenciaValida(competencia)) return zero(competencia);
  const { gte, lt } = competenciaRange(competencia);
  const db = tenantPrisma(prisma, lojaId);

  const [rec, itens] = await Promise.all([
    db.parcela.aggregate({ where: { status: "PAGA", recebidoEm: { gte, lt } }, _sum: { valorRecebido: true } }),
    db.pagamentoItem.findMany({
      where: { pagamento: { data: { gte, lt } } },
      select: { valor: true, contaPagar: { select: { categoria: true, tipo: true } } },
    }),
  ]);

  const receitasC = decParaCentavos(rec._sum.valorRecebido);

  const porCategoria = new Map<string, number>();
  for (const it of itens) {
    const rotulo = rotuloCategoria(it.contaPagar.categoria, it.contaPagar.tipo);
    porCategoria.set(rotulo, (porCategoria.get(rotulo) ?? 0) + decParaCentavos(it.valor));
  }
  const despesas: LinhaDespesa[] = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, c]) => ({ rotulo, total: deCentavos(c) }));
  const totalDespesasC = [...porCategoria.values()].reduce((s, c) => s + c, 0);

  return {
    competencia,
    receitas: deCentavos(receitasC),
    despesas,
    totalDespesas: deCentavos(totalDespesasC),
    resultado: deCentavos(receitasC - totalDespesasC),
  };
}
