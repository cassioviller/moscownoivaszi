/**
 * O10 (E169) — o select de vendedora não pode esconder quem está SELECIONADA.
 *
 * A tela de gerar contrato montava as opções com
 * `equipe.filter((m) => m.ativo !== false)` e o servidor não filtra nada: o
 * orçamento de uma vendedora que saiu da loja abria o diálogo com o
 * `vendedoraId` preenchido e **nenhuma opção correspondente**, então o
 * `<SelectValue>` desenhava o campo EM BRANCO. Quem visse "Escolha…" escolhia
 * outra pessoa — e a comissão de uma venda de R$ 5.000,00 (5% = R$ 250,00)
 * trocava de bolso por um campo que parecia vazio, sem uma palavra dizendo que
 * havia um valor ali.
 *
 * A régua: a lista é a dos ATIVOS **mais** a selecionada, e a inativa vai
 * marcada. Quem sai da loja não some das vendas que fez; some das próximas.
 */
export type MembroDaEquipe = {
  usuarioId: string;
  nome: string;
  ativo?: boolean;
};

export type OpcaoDeVendedora = {
  id: string;
  /** O que aparece no select — com "(desativada)" quando for o caso. */
  rotulo: string;
  ativa: boolean;
};

export function opcoesDeVendedora(
  equipe: ReadonlyArray<MembroDaEquipe>,
  selecionadaId: string | null | undefined,
): OpcaoDeVendedora[] {
  const opcoes: OpcaoDeVendedora[] = equipe
    .filter((m) => m.ativo !== false)
    .map((m) => ({ id: m.usuarioId, rotulo: m.nome, ativa: true }));

  if (!selecionadaId || opcoes.some((o) => o.id === selecionadaId)) return opcoes;

  const inativa = equipe.find((m) => m.usuarioId === selecionadaId);
  // Sem a linha na equipe não há nome a mostrar — e um id cru no select seria
  // pior que o branco. Este ramo é o do usuário de outra loja: a tela avisa
  // pelo rótulo, não inventa uma pessoa.
  opcoes.push({
    id: selecionadaId,
    rotulo: inativa ? `${inativa.nome} (desativada)` : "Vendedora fora da equipe atual",
    ativa: false,
  });
  return opcoes;
}
