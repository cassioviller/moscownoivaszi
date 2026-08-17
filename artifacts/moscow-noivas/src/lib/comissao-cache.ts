import {
  getListComissaoRegrasQueryKey,
  getListComissaoFechamentosQueryKey,
  getListBaixasEstornoComissaoQueryKey,
  getListPendenciasComissaoQueryKey,
  getPreviewComissaoQueryKey,
} from "@workspace/api-client-react";

/**
 * **O que uma ação da tela de comissões muda (S-R16).**
 *
 * A tela tinha SEIS ações que mexem no que a Prévia calcula e **cinco grafias
 * diferentes** da mesma invalidação — a medida de que o cuidado estava sendo
 * lembrado, e não cumprido (regra 26). Três das seis esqueciam a chave que
 * mais importa:
 *
 * - `onAlternarRegra` invalidava só a lista de regras. O preview lê
 *   `comissao_regras WHERE ativo = true` (`api-server/src/routes/comissao.ts:164`):
 *   desativada uma escada, o card da Prévia seguia mostrando a comissão
 *   calculada COM ela.
 * - `onRemoverRegra`, idem — e ali a regra nem existe mais.
 * - `onGerarFechamento` invalidava fechamentos, pendências e caixa, e não o
 *   preview. Competência fechada é IMUTÁVEL: a partir do fecho a resposta vem
 *   da memória do fechamento, não do cálculo ao vivo
 *   (`comissao.ts:963-969`) — o número na tela e o número pago passam a ter
 *   fontes diferentes.
 *
 * O número da Prévia é o que a dona lê **antes** de clicar em "Fechar
 * competência", e o fechamento lança conta a pagar. Daí as duas famílias
 * abaixo, nomeadas: quem mexe na ESCADA e quem mexe no FECHAMENTO. O caixa
 * continua vindo do `invalidarCaixa` (D9/E93), que é de outra tela e de outra
 * régua.
 */

/** Mexeu na escada de alguém — salvar, desativar/reativar, remover. */
export function chavesDaEscadaDeComissao(
  lojaId: string,
  competencia: string,
): readonly (readonly unknown[])[] {
  return [
    getListComissaoRegrasQueryKey(lojaId),
    getPreviewComissaoQueryKey(lojaId, { competencia }),
  ];
}

/** Baixou o estorno de alguém — o valor deixa de carregar na prévia. */
export function chavesDaBaixaDeEstorno(
  lojaId: string,
  competencia: string,
): readonly (readonly unknown[])[] {
  return [
    getListBaixasEstornoComissaoQueryKey(lojaId),
    getPreviewComissaoQueryKey(lojaId, { competencia }),
  ];
}

/** Fechou ou reabriu a competência — o preview troca de FONTE, não só de número. */
export function chavesDoFechamentoDeComissao(
  lojaId: string,
  competencia: string,
): readonly (readonly unknown[])[] {
  return [
    getListComissaoFechamentosQueryKey(lojaId),
    getListPendenciasComissaoQueryKey(lojaId),
    getPreviewComissaoQueryKey(lojaId, { competencia }),
  ];
}
