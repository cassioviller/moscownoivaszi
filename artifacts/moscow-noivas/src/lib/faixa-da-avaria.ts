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
 * ## S-C47 — e "qual aluguel" tem DUAS respostas, uma por momento
 *
 * **A avaria que já existe não pergunta: ela LÊ.** O payload traz
 * `aluguelDaPeca`, o número que a porta usou (`faixaDaAvariaRegistrada`), e é o
 * único jeito de a tela não oferecer o que o 422 recusa — o servidor confere o
 * teto contra o contrato que **COBRA** o reparo, e esta tela só conhece o
 * contrato **ATIVO** da noiva. Os dois coincidem enquanto três invariantes se
 * sustentam, e um deles tem furo medido: bloqueio sem dona (102 de 227 no
 * `heliumdb`) aceita ser cobrado em contrato de qualquer noiva, e ali a tela
 * anunciava "esta peça não está em contrato nenhum" sobre um véu com teto de
 * R$ 2.000,00.
 *
 * **A avaria que ainda não existe não tem o que ler**, e é por isso que
 * `aluguelDaPeca` continua de pé: no CADASTRO os dois lados derivam o mesmo
 * contrato — o ATIVO da dona do bloqueio (`aluguelDaPecaDoBloqueio`, no
 * servidor) — e não há payload de onde tirar o número antes de a linha nascer.
 * O que sobra dessa segunda grafia está declarado como sobra, e é pequeno de
 * propósito.
 *
 * O aluguel certo do cadastro é o do item do contrato **ATIVO** da noiva que
 * aponta a peça deste bloqueio. Cancelado é história — e a cobrança da avaria só
 * entra em contrato ativo, então é o mesmo recorte que o servidor usa. O índice
 * `contratos_lead_ativo_unico` (E158) garante que há no máximo um, então `find`
 * basta e não há empate a desfazer.
 *
 * `null` no aluguel não é falha: é a peça que ainda não está em contrato nenhum,
 * e o que a régua faz nesse caso — dizer que não conferiu — está declarado no
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

/**
 * **S-C47 — o veredicto de uma avaria que JÁ EXISTE, e o teto vem do servidor.**
 *
 * A diferença para `faixaNaTela` não é de conta — as duas chamam
 * `avaliarTaxaDeAvaria` —, é de FONTE do aluguel: aqui ele vem do payload, isto
 * é, do contrato que a porta vai conferir quando o PATCH chegar. Recalcular
 * daria o teto do contrato ATIVO da noiva, que é outra pergunta.
 *
 * O `tipo` e o `valor` continuam vindo do formulário porque a pessoa os está
 * editando; o aluguel não, porque ela não o edita — trocar de LIMPEZA para DANO
 * troca a régua sobre o MESMO aluguel, e é por isso que o payload carrega o
 * aluguel e não o teto já calculado.
 *
 * Avaria ausente (o diálogo fechado) responde como peça sem contrato: o veredicto
 * de um formulário que ninguém abriu não vai a lugar nenhum.
 */
export function faixaDaAvariaRegistrada(params: {
  avaria: { aluguelDaPeca?: number | null } | null | undefined;
  tipo: TipoDeAvaria;
  valor: number | null;
}): VeredictoDaTaxa {
  return avaliarTaxaDeAvaria({
    tipo: params.tipo,
    valor: params.valor,
    aluguelDaPeca: params.avaria?.aluguelDaPeca ?? null,
  });
}

/** O veredicto do CADASTRO, onde ainda não há payload — ver o cabeçalho. */
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
