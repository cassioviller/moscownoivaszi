import { describe, expect, it } from "vitest";
import { ApiError } from "@workspace/api-client-react";
import { deveDeslogar } from "./auth-erro";

/** Constrói um ApiError com o status desejado sem uma Response real. */
function apiError(status: number): ApiError {
  const resp = { status, statusText: "", headers: new Headers(), url: "" } as unknown as Response;
  return new ApiError(resp, null, { method: "GET", url: "/x" });
}

describe("deveDeslogar", () => {
  it("401 desloga — sessão expirada/inválida no meio do uso", () => {
    expect(deveDeslogar(apiError(401))).toBe(true);
  });

  it("403 NÃO desloga — logado, mas sem permissão para isto", () => {
    expect(deveDeslogar(apiError(403))).toBe(false);
  });

  it("500 e 404 não deslogam", () => {
    expect(deveDeslogar(apiError(500))).toBe(false);
    expect(deveDeslogar(apiError(404))).toBe(false);
  });

  it("erro que não é da API (rede, parse) não fala da sessão", () => {
    expect(deveDeslogar(new Error("network"))).toBe(false);
    expect(deveDeslogar(null)).toBe(false);
    expect(deveDeslogar({ status: 401 })).toBe(false); // objeto solto não é ApiError
  });
});
