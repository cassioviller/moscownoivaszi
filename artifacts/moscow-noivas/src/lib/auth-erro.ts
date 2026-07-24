import { ApiError } from "@workspace/api-client-react";

/**
 * Uma resposta 401 no meio do uso significa sessão expirada/inválida — o
 * servidor já recusou a chamada. Isto decide se, por causa dela, a interface
 * deve derrubar o estado "logado" para os guards mandarem à tela de login.
 *
 * Só 401: um 403 é "logado, mas sem permissão para ISTO" — deslogar seria
 * errado (a pessoa segue autenticada). Erro que não é da API (rede, parse) não
 * fala sobre a sessão.
 */
export function deveDeslogar(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
