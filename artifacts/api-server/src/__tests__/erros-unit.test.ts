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
