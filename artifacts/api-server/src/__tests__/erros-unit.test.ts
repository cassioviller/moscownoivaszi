import { describe, expect, it } from "vitest";
import { classificarErro, ehZodError } from "../lib/erros";

/** Um ZodError tem `name: "ZodError"` e `issues: []` — o que a detecção checa. */
function zodErrorFake() {
  return Object.assign(new Error("invalid"), {
    name: "ZodError",
    issues: [{ code: "invalid_type", path: ["id"], message: "expected string" }],
  });
}

/**
 * O classificador de erro do handler. O caso que motiva o módulo: um ZodError
 * que chega ao handler veio do `.parse()` da RESPOSTA (a entrada usa safeParse),
 * então a linha do banco não bate com o contrato — antes virava um 500 mudo,
 * igual a erro de infra. Agora rende um log próprio e greppável.
 */
describe("classificarErro", () => {
  it("ZodError na saída: 500 para o cliente, mas log de erro marcado", () => {
    const zerr = zodErrorFake(); // como o .parse() de uma linha de banco divergente
    expect(ehZodError(zerr)).toBe(true);

    const c = classificarErro(zerr);
    expect(c.status).toBe(500);
    // Não vaza schema para o cliente...
    expect(c.body).toEqual({ error: "ERRO_INTERNO", detalhe: "Erro interno do servidor" });
    // ...mas o log distingue de um 500 qualquer.
    expect(c.logLevel).toBe("error");
    expect(c.logMsg).toContain("RESPOSTA_FORA_DO_CONTRATO");
  });

  it("violação de unicidade (23505) vira 409", () => {
    const c = classificarErro({ code: "23505" });
    expect(c.status).toBe(409);
    expect(c.body.error).toBe("REGISTRO_DUPLICADO");
    expect(c.logLevel).toBe("warn");
  });

  /**
   * S-O2/E180 — o índice NOMEADO responde por si.
   *
   * O `constraint` que o `pg` põe no erro é o dado que separa as restrições
   * únicas umas das outras, e ele chegava aqui e era descartado: o índice
   * parcial `contratos_lead_ativo_unico` — a rede da guarda que o E158 pôs sob
   * tranca — saía como "Já existe um registro com estes dados" por qualquer
   * porta que não fosse o `POST /contratos`, que tem a sua própria guarda.
   */
  it("o índice conhecido responde com o código da guarda que ele protege", () => {
    const c = classificarErro({ code: "23505", constraint: "contratos_lead_ativo_unico" });
    expect(c.status).toBe(409);
    expect(c.body.error).toBe("CONTRATO_ATIVO_DUPLICADO");
    expect(c.body.detalhe).toContain("contrato ativo");
    expect(c.logMsg).toContain("contratos_lead_ativo_unico");
  });

  it("e o nome do índice também é lido através da cadeia de `cause`", () => {
    const c = classificarErro({ cause: { cause: { code: "23505", constraint: "usuarios_email_unique" } } });
    expect(c.body.error).toBe("EMAIL_EM_USO");
  });

  /**
   * O outro lado, e é decisão: **fechar a classe não é prometer conhecer as
   * ~30 restrições únicas do banco.** Índice sem tradução própria continua
   * genérico — o que muda é que o LOG passa a dizer o nome, que é por onde a
   * próxima tradução entra.
   */
  it("índice sem tradução própria segue genérico, e o log passa a dizer o nome", () => {
    const c = classificarErro({ code: "23505", constraint: "portal_tokens_token_unq" });
    expect(c.body.error).toBe("REGISTRO_DUPLICADO");
    expect(c.logMsg).toContain("portal_tokens_token_unq");
  });

  it("código do Postgres embrulhado em cause também é lido", () => {
    const c = classificarErro({ cause: { code: "23503" } });
    expect(c.status).toBe(409);
    expect(c.body.error).toBe("VINCULO_EXISTENTE");
  });

  /**
   * S12/E107 — o invariante que faltava, e que este arquivo violava sem notar.
   *
   * O E96 estabeleceu que `error` carrega CÓDIGO e a prosa mora em `detalhe`.
   * O `classificarErro` era a última fonte de texto livre no campo — e o teste
   * acima **afirmava a frase** (`toContain("vínculos")`), congelando o defeito
   * num assert. Este caso olha os quatro caminhos do módulo de uma vez.
   *
   * A régua: código é MAIÚSCULA_COM_UNDERSCORE, sem espaço e sem acento. Se um
   * dia alguém acrescentar um caminho novo com frase, cai aqui.
   */
  it("nenhum caminho põe frase no campo `error` — ele é código, sempre", () => {
    const casos = [
      zodErrorFake(),
      { code: "23505" },
      { code: "23503" },
      { code: "23P01" },
      { code: "40P01" },
      { code: "40001" },
      new Error("qualquer outra coisa"),
    ];
    for (const err of casos) {
      const { error, detalhe } = classificarErro(err).body;
      expect(error, `código inválido: ${error}`).toMatch(/^[A-Z][A-Z_]*$/);
      // E a frase não se perdeu: ela existe, só mudou de campo.
      expect(detalhe, `sem detalhe para ${error}`).toBeTruthy();
    }
  });

  it("conflito de disponibilidade (23P01) vira 409", () => {
    expect(classificarErro({ code: "23P01" }).status).toBe(409);
  });

  /**
   * S-D19/E143 — a corrida do EXCLUDE gist nem sempre termina em 23P01: em
   * 300 pares de INSERTs concorrentes, 34 perdedores levaram DEADLOCK (40P01)
   * e viravam 500 — o flake [201, 500] do lote17. Deadlock e falha de
   * serialização (40001) são concorrência, não quebra: 409, tente de novo.
   */
  it("deadlock (40P01) e falha de serialização (40001) viram 409, mesmo em cause", () => {
    const dead = classificarErro({ code: "40P01" });
    expect(dead.status).toBe(409);
    expect(dead.body.error).toBe("OPERACAO_CONCORRENTE");
    expect(dead.logLevel).toBe("warn");
    expect(classificarErro({ cause: { code: "40001" } }).status).toBe(409);
  });

  it("erro desconhecido é 500 genérico, logado como erro", () => {
    const c = classificarErro(new Error("boom"));
    expect(c.status).toBe(500);
    expect(c.logLevel).toBe("error");
    expect(c.logMsg).toBe("Erro não tratado");
  });

  it("corpo acima do limite do parser vira 413, não 500 — mesmo embrulhado", () => {
    // O body-parser marca `type: "entity.too.large"`; antes caía no 500 mudo.
    const c = classificarErro({ type: "entity.too.large" });
    expect(c.status).toBe(413);
    expect(c.body.error).toBe("PAYLOAD_MUITO_GRANDE");
    expect(c.logLevel).toBe("warn");
    expect(classificarErro({ cause: { type: "entity.too.large" } }).status).toBe(413);
  });
});
