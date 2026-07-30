import {
  getGetFluxoCaixaQueryKey,
  getGetDreQueryKey,
  getGetAlertaCaixaQueryKey,
  getGetDashboardQueryKey,
  getListPagamentosQueryKey,
  getListParcelasQueryKey,
  getListContasPagarQueryKey,
} from "@workspace/api-client-react";

/**
 * O que um movimento de caixa muda (D9/E93).
 *
 * Receber, estornar, pagar e estornar-pagamento mexem em mais coisa do que na
 * lista da própria tela: no fluxo, no DRE, no alerta de caixa (que o dashboard
 * e o sino montam em TODA tela) e no outro lado da operação. Antes,
 * `receber.tsx` invalidava só as parcelas — e o dano era invisível porque o
 * `staleTime: 0` refazia tudo na navegação seguinte. Com o piso de `staleTime`
 * do D3, a mesma omissão vira número financeiro VELHO e persistente: depois de
 * receber R$ 5.000 o alerta continuaria dizendo que o caixa fura na data
 * antiga. É por isso que este conserto vem ANTES do `staleTime`.
 *
 * A chave que o Orval gera é `[url, ...(params ? [params] : [])]` e o TanStack
 * casa por PREFIXO: passar só o `lojaId` alcança a tela com janela, a sem
 * janela e a de qualquer filtro, sem precisar conhecer nenhum deles. É a
 * mesma escolha do `invalidarColunas` do funil, um nível acima.
 */
export function chavesDoCaixa(lojaId: string): readonly (readonly unknown[])[] {
  return [
    getListParcelasQueryKey(lojaId),
    getListContasPagarQueryKey(lojaId),
    getListPagamentosQueryKey(lojaId),
    getGetFluxoCaixaQueryKey(lojaId),
    getGetDreQueryKey(lojaId),
    getGetAlertaCaixaQueryKey(lojaId),
    // E115 — o dashboard soma "a receber/pagar (30 dias)" das MESMAS tabelas
    // que estas mutations mudam, e ficou fora da régua desde o D9: com o piso
    // de staleTime, receber R$ 5.000,00 e voltar ao painel mostrava um
    // a-receber que ainda somava o que acabou de entrar.
    getGetDashboardQueryKey(lojaId),
  ];
}
