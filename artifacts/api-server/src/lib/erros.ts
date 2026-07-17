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

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" ? code : undefined;
}

/** Duck-typing em vez de `instanceof`: há dois zod no build (zod e zod/v4). */
export function ehZodError(err: unknown): boolean {
  const e = err as { name?: unknown; issues?: unknown };
  return e?.name === "ZodError" && Array.isArray(e?.issues);
}

export function classificarErro(err: unknown): Classificacao {
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
