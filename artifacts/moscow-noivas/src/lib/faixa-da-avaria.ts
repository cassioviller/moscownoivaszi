import { avaliarTaxaDeAvaria, type TipoDeAvaria, type VeredictoDaTaxa } from "@workspace/financeiro-core";

/**
 * **Quanto a taxa pode ser, antes de a vendedora clicar em "Registrar avaria"**
 * — E214, cláusulas 14ª e 15ª do contrato de locação.
 *
 * A conta é a mesma do servidor (`financeiro-core/avaria.ts`), e é por isso que
 * ela vem de lá em vez de ser reescrita aqui: duas grafias da mesma faixa
 * divergiriam no dia em que a dona mudasse o número, e a tela passaria a
 * anunciar um limite que a porta não pratica. **A régua é uma só; o que a tela
 * acrescenta é só saber QUAL aluguel perguntar.**
 *
 * O aluguel certo é o do item do contrato **ATIVO** da noiva que aponta a peça
 * deste bloqueio. Cancelado é história — e a cobrança da avaria só entra em
 * contrato ativo, então é o mesmo recorte que o servidor usa. O índice
 * `contratos_lead_ativo_unico` (E158) garante que há no máximo um, então `find`
 * basta e não há empate a desfazer.
 *
 * `null` no aluguel não é falha: é a peça que ainda não está em contrato nenhum,
 * e o que a régua faz nesse caso — pedir a razão escrita — está declarado no
 * módulo do `financeiro-core`.
 */
export type ContratoParaFaixa = {
  status: string;
  itens?: { vestidoId?: string | null; valorUnitario: number }[];
};

/**
 * O aluguel desta peça no contrato ativo, ou `null`.
 *
 * Duas linhas para a mesma peça devolvem a MAIOR, exatamente como o servidor —
 * a régua tem de ser a mesma dos dois lados, inclusive no desempate.
 */
export function aluguelDaPeca(params: {
  contratos: ContratoParaFaixa[] | undefined;
  vestidoId: string | null | undefined;
}): number | null {
  const { contratos, vestidoId } = params;
  if (!vestidoId) return null;
  const ativo = (contratos ?? []).find((c) => c.status === "ATIVO");
  if (!ativo?.itens) return null;
  const valores = ativo.itens
    .filter((i) => i.vestidoId === vestidoId)
    .map((i) => i.valorUnitario);
  return valores.length > 0 ? Math.max(...valores) : null;
}

/** O veredicto que a tela mostra — a MESMA função que a porta chama. */
export function faixaNaTela(params: {
  contratos: ContratoParaFaixa[] | undefined;
  vestidoId: string | null | undefined;
  tipo: TipoDeAvaria;
  valor: number | null;
}): VeredictoDaTaxa {
  return avaliarTaxaDeAvaria({
    tipo: params.tipo,
    valor: params.valor,
    aluguelDaPeca: aluguelDaPeca({ contratos: params.contratos, vestidoId: params.vestidoId }),
  });
}
