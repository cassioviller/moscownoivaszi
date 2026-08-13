import { reajusteDaTrocaDeData, type ReajusteDaTroca } from "@workspace/financeiro-core";

/**
 * **O que a troca de data vai CUSTAR, antes de a vendedora clicar** — E211,
 * cláusula 17ª §§2º e 3º do contrato de locação.
 *
 * A conta é a mesma do servidor (`financeiro-core/reajuste.ts`), e é por isso
 * que ela vem de lá em vez de ser reescrita aqui: duas grafias da mesma
 * cláusula divergiriam no dia em que a escada mudasse, e a tela passaria a
 * prometer um valor que a porta não cobra. **A régua é uma só; o que a tela
 * acrescenta é só saber QUAL contrato perguntar.**
 *
 * O contrato certo é o **ATIVO** — cancelado é história, e o servidor não o
 * reajusta. O índice `contratos_lead_ativo_unico` (E158) garante que há no
 * máximo um, então `find` basta e não há empate a desfazer.
 *
 * `null` é a resposta da maioria das trocas: sem contrato ativo, ou dentro do
 * mesmo ano, a cláusula não incide e não há o que avisar.
 */
export type ContratoParaReajuste = {
  status: string;
  valorTotal: number;
  reajustesDeData?: number;
};

export function reajustePrevisto(params: {
  contratos: ContratoParaReajuste[];
  deDia: string | null | undefined;
  paraDia: string | null | undefined;
}): ReajusteDaTroca | null {
  const { contratos, deDia, paraDia } = params;
  if (!deDia || !paraDia) return null;

  const ativo = contratos.find((c) => c.status === "ATIVO");
  if (!ativo) return null;

  return reajusteDaTrocaDeData({
    deDia,
    paraDia,
    // `?? 0` é o contrato gravado antes da coluna existir: ele nunca foi
    // reajustado, então começa no primeiro degrau — a mesma decisão do default
    // da migração.
    trocasCobradasAntes: ativo.reajustesDeData ?? 0,
    valorTotal: ativo.valorTotal,
  });
}
