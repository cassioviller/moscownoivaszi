/**
 * Classificação de erro não tratado para o error handler do Express.
 *
 * Pura (sem Express, sem log): recebe o erro, devolve status + corpo + como
 * logar. Isso permite testar a decisão — em especial a distinção que motivou
 * este módulo: um `ZodError` que chega aqui veio do `.parse()` da RESPOSTA (a
 * entrada usa `safeParse` e responde 400 na própria rota), o que significa que
 * a linha do banco não bate com o contrato. Antes isso caía no 500 genérico,
 * indistinguível de um erro de infra — foi assim que o bug de cobrança esperou
 * por 227 testes. Agora rende um log próprio, com as `issues`, para aparecer.
 */

export type Classificacao = {
  status: number;
  body: { error: string };
  logLevel: "warn" | "error";
  logMsg: string;
};

/**
 * Código de erro do Postgres, caminhando a cadeia de `cause` inteira: o driver
 * e o ORM embrulham o erro, e numa transação o código fica DOIS ou mais níveis
 * abaixo. Ler só um nível (o que havia) deixava um 23505 de transação escapar
 * para o 500 genérico em vez do 409.
 */
export function pgErrorCode(err: unknown): string | undefined {
  let atual: unknown = err;
  for (let i = 0; i < 8 && atual && typeof atual === "object"; i++) {
    const code = (atual as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    atual = (atual as { cause?: unknown }).cause;
  }
  return undefined;
}

/** True se o erro (em qualquer nível da cadeia) é violação de unicidade. */
export function ehViolacaoUnica(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

/** Duck-typing em vez de `instanceof`: há dois zod no build (zod e zod/v4). */
export function ehZodError(err: unknown): boolean {
  const e = err as { name?: unknown; issues?: unknown };
  return e?.name === "ZodError" && Array.isArray(e?.issues);
}

/**
 * True se o erro (em qualquer nível da cadeia) é o `entity.too.large` do
 * body-parser — corpo maior que o limit do express.json. Sem isto, mandar uma
 * foto grande demais virava 500 genérico, indistinguível de bug.
 */
export function ehCorpoGrandeDemais(err: unknown): boolean {
  let atual: unknown = err;
  for (let i = 0; i < 8 && atual && typeof atual === "object"; i++) {
    if ((atual as { type?: unknown }).type === "entity.too.large") return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

export function classificarErro(err: unknown): Classificacao {
  if (ehCorpoGrandeDemais(err)) {
    return {
      status: 413,
      body: { error: "PAYLOAD_MUITO_GRANDE" },
      logLevel: "warn",
      logMsg: "Corpo da requisição acima do limite do parser",
    };
  }

  if (ehZodError(err)) {
    // O cliente não tem culpa nem conserto — segue 500 genérico para ele; o
    // recado vai para o LOG, com marcação greppável.
    return {
      status: 500,
      body: { error: "Erro interno do servidor" },
      logLevel: "error",
      logMsg: "RESPOSTA_FORA_DO_CONTRATO: ZodError na saída — a linha do banco não bate com o schema",
    };
  }

  const code = pgErrorCode(err);
  if (code === "23505") {
    return { status: 409, body: { error: "Registro duplicado ou conflito de dados" }, logLevel: "warn", logMsg: "Violação de unicidade" };
  }
  if (code === "23503") {
    return { status: 409, body: { error: "Operação viola vínculos existentes" }, logLevel: "warn", logMsg: "Violação de integridade referencial" };
  }
  if (code === "23P01") {
    return { status: 409, body: { error: "Conflito de disponibilidade" }, logLevel: "warn", logMsg: "Violação de exclusão (sobreposição de disponibilidade)" };
  }

  return { status: 500, body: { error: "Erro interno do servidor" }, logLevel: "error", logMsg: "Erro não tratado" };
}
