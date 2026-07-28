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

/** Um campo que o servidor recusou, com o motivo já em português. */
export type CampoInvalido = { campo: string; motivo: string };

/** O que o servidor manda no corpo de erro. `detalhe` é texto para humano. */
type CorpoErro = { data?: { error?: string; detalhe?: string; campos?: CampoInvalido[] } };

/** Os campos que o servidor apontou, ou lista vazia. */
export function camposDoErro(err: unknown): CampoInvalido[] {
  const campos = (err as CorpoErro | undefined)?.data?.campos;
  return Array.isArray(campos) ? campos.filter((c) => c && typeof c.campo === "string") : [];
}

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

/**
 * E12/E99 — 404 não é falha, e por isso não é `<Erro>`.
 *
 * Uma tela de detalhe que recebe 404 mostrava o mesmo alerta destrutivo de um
 * 500, com "Tentar novamente" ao lado. As duas coisas estão erradas: o registro
 * não existe (o sistema respondeu certo, e depressa), e repetir a mesma busca
 * vai devolver 404 de novo — o botão convida a um gesto que não pode dar certo.
 *
 * O que a pessoa precisa ali é saber que aquele endereço não leva a nada e ter
 * a saída para a lista, que é o que o `<NaoEncontrado>` faz.
 */
export function ehNaoEncontrado(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/**
 * D6/E96 — o erro do servidor chega ao CAMPO que o causou.
 *
 * Antes, todo 400/422 virava toast destrutivo: a mensagem aparecia no canto da
 * tela enquanto o input errado seguia sem marca nenhuma, e num formulário de
 * doze campos a pessoa tinha de adivinhar qual. Pior no diálogo de gerar
 * contrato, que continua aberto por cima do toast.
 *
 * Esta função é o único tratamento: marca cada campo que o servidor apontou e
 * devolve `true`. Só quando não há campo — erro de regra, de rede, de
 * permissão — ela devolve `false` e a tela abre o toast, que aí é o lugar certo.
 *
 * O `campo` do servidor é o caminho do Zod (`itens.0.valorUnitario`), que é
 * exatamente o formato de `path` do react-hook-form. Se NENHUM dos campos
 * apontados existe neste formulário, ela devolve `false` de propósito: marcar
 * um input que a pessoa não está vendo esconde o recado, e o toast passa a ser
 * o lugar certo. Silenciar seria a única saída errada.
 */
export function aplicarErroDoServidor(
  /**
   * Tipado com `any` no caminho do campo de propósito. O `setError` do
   * react-hook-form recebe um `FieldPath<T>` — uma união de literais derivada do
   * schema —, e com `strictFunctionTypes` ligado (E104/A13) um parâmetro
   * `string` é checado de forma CONTRAVARIANTE contra ele e não passa. Esta
   * função é genérica por natureza: ela recebe caminhos que vêm do SERVIDOR, e
   * o servidor não conhece o tipo do formulário.
   */
  form: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setError: (campo: any, erro: { type: string; message: string }) => void;
    getValues: () => Record<string, unknown>;
  },
  err: unknown,
): boolean {
  const campos = camposDoErro(err);
  if (campos.length === 0) return false;

  const conhecidos = Object.keys(form.getValues());
  let marcou = false;
  for (const { campo, motivo } of campos) {
    const raiz = campo.split(".")[0];
    if (campo && conhecidos.includes(raiz)) {
      form.setError(campo, { type: "server", message: motivo });
      marcou = true;
    }
  }
  // Nenhum dos campos existe neste formulário: o recado é geral, e some se
  // ficarmos calados. Devolver false manda a tela abrir o toast.
  return marcou;
}
