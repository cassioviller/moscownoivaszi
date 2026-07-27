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

/** Um campo que não passou, com o motivo já em português. */
export type CampoInvalido = { campo: string; motivo: string };

/** O corpo de um 400 de validação. `error` é o código que a tela traduz. */
export type CorpoInvalido = { error: "CORPO_INVALIDO"; campos: CampoInvalido[] };

type IssueZod = {
  path?: unknown[];
  code?: string;
  expected?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  type?: string;
  origin?: string;
};

/**
 * Motivo em português a partir do CÓDIGO da issue — nunca do `message` do Zod.
 *
 * A mensagem do Zod é escrita para quem programa e em inglês ("Expected string,
 * received number"); esta função é escrita para quem vende vestido. Traduzir a
 * frase seria adivinhação: o código é o dado estável.
 */
function motivoDaIssue(issue: IssueZod): string {
  const limite = (v: number | bigint | undefined) => (v === undefined ? "" : String(v));
  const ehTexto = issue.origin === "string" || issue.type === "string";

  switch (issue.code) {
    case "invalid_type":
      // Zod v4 diz `expected` e omite `received` quando o valor não veio.
      return issue.expected === "undefined" ? "Campo inválido" : "Campo obrigatório ou com tipo errado";
    case "too_small":
      if (ehTexto) return `Precisa ter pelo menos ${limite(issue.minimum)} caractere(s)`;
      return `Precisa ser pelo menos ${limite(issue.minimum)}`;
    case "too_big":
      if (ehTexto) return `Passa do limite de ${limite(issue.maximum)} caractere(s)`;
      return `Precisa ser no máximo ${limite(issue.maximum)}`;
    case "invalid_format":
      return "Formato inválido";
    case "invalid_value":
    case "invalid_enum_value":
      return "Valor não é um dos aceitos";
    case "unrecognized_keys":
      return "Campo desconhecido";
    case "not_multiple_of":
      return "Valor não é um múltiplo permitido";
    default:
      return "Valor inválido";
  }
}

/**
 * B13/E96 — o 400 de validação com código estável e endereço do erro.
 *
 * Noventa e cinco rotas devolviam `{ error: parsed.error.message }`, e o
 * `message` de um ZodError é o **JSON serializado do array de issues**: a tela
 * recebia `[{"code":"invalid_type","path":["valorTotal"],...}]` e não tinha o
 * que fazer com aquilo além de despejá-lo num toast vermelho. A vendedora lia
 * um array de objetos em inglês com a noiva do lado.
 *
 * O que sai agora é `{ error: "CORPO_INVALIDO", campos: [{campo, motivo}] }` —
 * o código a tela traduz, e `campo` é o caminho (`itens.0.valorUnitario`) que
 * ela usa para marcar o input em vez de abrir um toast.
 *
 * Aceita `unknown` de propósito: há dois zod no build (zod e zod/v4), então
 * `instanceof` mente — a checagem é a mesma duck-typing de `ehZodError`.
 */
export function erroDeValidacao(err: unknown): CorpoInvalido {
  if (!ehZodError(err)) {
    return { error: "CORPO_INVALIDO", campos: [] };
  }
  const issues = (err as { issues: IssueZod[] }).issues;
  const campos = issues.map((issue) => ({
    // Caminho vazio = o corpo inteiro (não é objeto, veio nulo). A tela sabe
    // que sem campo o recado é geral.
    campo: (issue.path ?? []).map(String).join("."),
    motivo: motivoDaIssue(issue),
  }));
  return { error: "CORPO_INVALIDO", campos };
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
