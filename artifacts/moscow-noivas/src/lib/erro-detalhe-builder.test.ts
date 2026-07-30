import { describe, expect, it } from "vitest";
import { ApiError } from "@workspace/api-client-react";

/**
 * C4/E122 — o builder do cliente gerado lê a grafia da CASA.
 *
 * `custom-fetch.ts` monta `err.message` procurando `detail`/`message` — a
 * grafia de outra convenção — e o corpo que o servidor escreve é
 * `{ error: CODIGO, detalhe: "frase em português" }`. Resultado fotografado
 * pela trilha C: o toast dizia "HTTP 409 Conflict: CONVITE_PENDENTE" e jogava
 * fora "Use reenviar ou cancele o convite existente" (`equipe.ts:245`).
 *
 * A régua das telas é `mensagemApi` (que já lê `detalhe`); este teste blinda a
 * camada de BAIXO — a mensagem do próprio erro, a que aparece em console, log
 * e em qualquer consumidor fora da régua.
 */

function erroDe(status: number, statusText: string, corpo: unknown): ApiError {
  const resposta = new Response(JSON.stringify(corpo), { status, statusText });
  return new ApiError(resposta, corpo, { method: "POST", url: "/lojas/x/equipe/convites" });
}

describe("buildErrorMessage lê `detalhe` — a grafia da casa", () => {
  it("corpo {error, detalhe}: a mensagem carrega a frase, não só o código", () => {
    const err = erroDe(409, "Conflict", {
      error: "CONVITE_PENDENTE",
      detalhe: "Use reenviar ou cancele o convite existente",
    });
    expect(err.message).toBe(
      "HTTP 409 Conflict: Use reenviar ou cancele o convite existente",
    );
  });

  it("`detail` (a grafia gringa) segue valendo como fallback de compatibilidade", () => {
    const err = erroDe(422, "Unprocessable Entity", {
      detail: "Field is required",
    });
    expect(err.message).toBe("HTTP 422 Unprocessable Entity: Field is required");
  });

  it("`detalhe` ganha de `detail` quando os dois existem", () => {
    const err = erroDe(422, "Unprocessable Entity", {
      detail: "gringo",
      detalhe: "da casa",
    });
    expect(err.message).toContain("da casa");
    expect(err.message).not.toContain("gringo");
  });

  it("sem detalhe nenhum, o campo `error` continua aparecendo (como antes)", () => {
    const err = erroDe(404, "Not Found", { error: "FECHAMENTO_NAO_ENCONTRADO" });
    expect(err.message).toBe("HTTP 404 Not Found: FECHAMENTO_NAO_ENCONTRADO");
  });
});
