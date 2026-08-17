import {
  getListLojasQueryKey,
  getListUsuariosQueryKey,
  getListAuditoriaGlobalQueryKey,
  getGetConsolidadoQueryKey,
} from "@workspace/api-client-react";

/**
 * **O que um ato do console de superadmin muda (S-R19).**
 *
 * O console tem TRÊS cartões na mesma tela, e os atos dele mexiam num só. A
 * Auditoria global existe justamente para mostrar *"quem apagou que loja, quem
 * apagou que pessoa"* (`pages/admin/index.tsx:208-211`) — as duas únicas
 * escritas com `loja_id` nulo (`api-server/src/routes/admin.ts:244,625`) —, e
 * era a única lista da tela que os dois "Apagar" não refaziam: apagava-se a
 * loja, a linha sumia da tabela de cima, e o cartão que deveria registrar o
 * ato continuava dizendo *"nenhuma loja ou pessoa foi apagada"*.
 *
 * O consolidado da rede é uma linha por loja **ativa**
 * (`admin.ts:699-700`) e some inteiro abaixo de duas linhas
 * (`admin/index.tsx:145`): apagar, criar ou DESATIVAR uma loja muda essa
 * tabela, e nenhum dos três a refazia.
 */

/** Nasceu, mudou ou saiu uma LOJA — a rede inteira é outra. */
export function chavesDoAtoSobreLoja(): readonly (readonly unknown[])[] {
  return [getListLojasQueryKey(), getGetConsolidadoQueryKey()];
}

/** Apagar é o único ato do console que deixa trilha global (`loja_id` nulo). */
export function chavesDoAtoDeApagar(alvo: "loja" | "pessoa"): readonly (readonly unknown[])[] {
  return [
    ...(alvo === "loja" ? chavesDoAtoSobreLoja() : [getListUsuariosQueryKey()]),
    getListAuditoriaGlobalQueryKey(),
  ];
}
