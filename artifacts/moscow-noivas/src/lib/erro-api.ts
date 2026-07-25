import { ApiError } from "@workspace/api-client-react";

/**
 * A régua ÚNICA de "o que a pessoa lê quando a chamada falha".
 *
 * E92/E4: a última perna desta função devolvia `err.message`, e a mensagem que
 * o cliente gerado monta é `` `HTTP ${status} ${statusText}` `` — então o toast
 * do login dizia, com todas as letras, **"Erro ao fazer login / HTTP 404 Not
 * Found"**, e pelo mesmo caminho saíam "HTTP 422 Unprocessable Entity" ao
 * gerar contrato e "HTTP 500 Internal Server Error" em qualquer tela de
 * financeiro. A vendedora com a noiva ao lado lê "404" e não tem o que fazer
 * com isso: não sabe se errou a senha, se a internet caiu ou se o sistema
 * quebrou. A mensagem assusta e não orienta.
 *
 * A ordem é do mais específico para o mais genérico, e o fim da fila é sempre
 * o texto da TELA — nunca o do protocolo:
 *
 *   1. código que a tela conhece (`mensagens[codigo]`) — ela sabe o que fazer;
 *   2. `detalhe` do servidor — escrito por nós, em português, para gente;
 *   3. régua por faixa de status — vale para qualquer tela;
 *   4. `fallback` da tela.
 */

/** O que o servidor manda no corpo de erro. `detalhe` é texto para humano. */
type CorpoErro = { data?: { error?: string; detalhe?: string } };

/**
 * O que dizer por faixa de status quando a tela não tem nada mais específico.
 * Cada frase diz o que aconteceu E o que fazer — é o que "HTTP 403" não faz.
 */
const POR_FAIXA: Record<number, string> = {
  401: "Sua sessão expirou. Entre de novo.",
  403: "Seu acesso não permite isso — peça à gerente.",
};

const SEM_RESPOSTA = "Não consegui falar com o sistema. Tente de novo em um instante.";

export function mensagemApi(
  err: unknown,
  fallback: string,
  mensagens: Record<string, string> = {},
  /**
   * Sobrescreve a régua por faixa nas telas onde o mesmo status quer dizer
   * outra coisa. O caso real é o login: ali um 401 não é "sessão expirou" —
   * a pessoa nem tinha sessão —, é "e-mail ou senha não conferem".
   */
  porStatus: Record<number, string> = {},
): string {
  const e = err as CorpoErro | undefined;

  const codigo = e?.data?.error;
  if (codigo && mensagens[codigo]) return mensagens[codigo];
  if (e?.data?.detalhe) return e.data.detalhe;

  if (err instanceof ApiError) {
    if (porStatus[err.status]) return porStatus[err.status];
    if (POR_FAIXA[err.status]) return POR_FAIXA[err.status];
    if (err.status >= 500) return SEM_RESPOSTA;
    return fallback;
  }

  // Não é erro DA API: rede caída, DNS, parse. O sistema não respondeu.
  if (err instanceof Error) return SEM_RESPOSTA;

  return fallback;
}
