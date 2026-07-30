import { describe, expect, it } from "vitest";
import { ApiError } from "@workspace/api-client-react";
import { mensagemApi } from "./erro-api";

/**
 * O teste que blinda o E4: NENHUM caminho desta função pode terminar em
 * `err.message`, porque a mensagem que o cliente gerado monta é
 * "HTTP 404 Not Found" — e foi isso que a trilha E fotografou no toast do
 * login (`00-pos-login.png`).
 */

/** Um erro da API igual ao que o `custom-fetch` levanta, com `message` venenosa. */
function erroApi(status: number, corpo: unknown = null): ApiError {
  const resposta = new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    statusText: status === 404 ? "Not Found" : "Erro",
  });
  return new ApiError(resposta, corpo, { method: "POST", url: "/auth/login" });
}

describe("mensagemApi", () => {
  it("NUNCA devolve a mensagem crua do erro (o 'HTTP 404 Not Found' do toast)", () => {
    const err = erroApi(404);
    expect(err.message).toContain("HTTP 404"); // a mensagem venenosa existe…
    expect(mensagemApi(err, "Não consegui fazer isso.")).toBe("Não consegui fazer isso.");
    expect(mensagemApi(err, "Não consegui fazer isso.")).not.toContain("HTTP");
  });

  it("código que a tela conhece ganha de tudo", () => {
    const err = erroApi(422, { error: "REFERENCIA_INVALIDA" });
    expect(
      mensagemApi(err, "fallback", { REFERENCIA_INVALIDA: "Essa noiva não é desta loja." }),
    ).toBe("Essa noiva não é desta loja.");
  });

  it("detalhe do servidor passa: é texto nosso, escrito para gente", () => {
    const err = erroApi(422, { error: "SENHA_REPETIDA", detalhe: "A nova senha é igual à atual." });
    expect(mensagemApi(err, "fallback")).toBe("A nova senha é igual à atual.");
  });

  it("401 diz que a sessão expirou e o que fazer", () => {
    expect(mensagemApi(erroApi(401), "fallback")).toBe("Sua sessão expirou. Entre de novo.");
  });

  it("403 diz que é permissão, e a quem pedir", () => {
    expect(mensagemApi(erroApi(403), "fallback")).toBe(
      "Seu acesso não permite isso — peça à gerente.",
    );
  });

  it("5xx não culpa a pessoa nem mostra o número", () => {
    for (const status of [500, 502, 503]) {
      const m = mensagemApi(erroApi(status), "fallback");
      expect(m).toBe("Não consegui falar com o sistema. Tente de novo em um instante.");
      expect(m).not.toContain(String(status));
    }
  });

  it("erro que não é da API (rede, parse) é 'não consegui falar com o sistema'", () => {
    expect(mensagemApi(new TypeError("Failed to fetch"), "fallback")).toBe(
      "Não consegui falar com o sistema. Tente de novo em um instante.",
    );
    expect(mensagemApi(new TypeError("Failed to fetch"), "fallback")).not.toContain("fetch");
  });

  it("4xx sem código conhecido cai no texto da TELA, que sabe do que fala", () => {
    expect(mensagemApi(erroApi(409), "Esta competência já foi fechada.")).toBe(
      "Esta competência já foi fechada.",
    );
    expect(mensagemApi(erroApi(400), "Confira os campos do formulário.")).toBe(
      "Confira os campos do formulário.",
    );
  });

  /**
   * O login é a única tela onde 401 NÃO quer dizer "sua sessão expirou" — a
   * pessoa nem tinha sessão. `porStatus` existe só para este caso.
   */
  it("o login sobrescreve o 401 com 'e-mail ou senha não conferem'", () => {
    const err = erroApi(401, { error: "Credenciais inválidas" });
    expect(
      mensagemApi(err, "Não consegui entrar agora.", {}, { 401: "E-mail ou senha não conferem." }),
    ).toBe("E-mail ou senha não conferem.");
  });

  it("erro que não é Error nenhum (undefined, string) cai no fallback", () => {
    expect(mensagemApi(undefined, "fallback")).toBe("fallback");
    expect(mensagemApi("qualquer coisa", "fallback")).toBe("fallback");
  });
});
