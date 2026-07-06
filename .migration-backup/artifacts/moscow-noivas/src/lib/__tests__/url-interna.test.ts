import { describe, it, expect } from "vitest";
import { caminhoInternoSeguro } from "@/lib/url-interna";

describe("caminhoInternoSeguro", () => {
  const loja = "abc";
  const fb = "/loja/abc/financeiro/receber";

  it("aceita caminhos da própria loja", () => {
    expect(caminhoInternoSeguro("/loja/abc", loja, fb)).toBe("/loja/abc");
    expect(caminhoInternoSeguro("/loja/abc/contratos/1", loja, fb)).toBe("/loja/abc/contratos/1");
    expect(caminhoInternoSeguro("/loja/abc?filtro=atrasadas", loja, fb)).toBe("/loja/abc?filtro=atrasadas");
  });

  it("rejeita prefixo de outra loja, escape com .. e externos → fallback", () => {
    expect(caminhoInternoSeguro("/loja/abcXYZ/evil", loja, fb)).toBe(fb); // prefixo sem fronteira
    expect(caminhoInternoSeguro("/loja/abc/../../outra/x", loja, fb)).toBe(fb); // escape com ..
    expect(caminhoInternoSeguro("https://evil.com", loja, fb)).toBe(fb);
    expect(caminhoInternoSeguro("/loja/outra/x", loja, fb)).toBe(fb);
    expect(caminhoInternoSeguro("", loja, fb)).toBe(fb);
  });
});
