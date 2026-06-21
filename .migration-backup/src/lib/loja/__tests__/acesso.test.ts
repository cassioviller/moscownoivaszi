// src/lib/loja/__tests__/acesso.test.ts
import { describe, it, expect } from "vitest";
import { resolverAcessoLoja, mostrarTrocaLoja } from "@/lib/loja/acesso";

describe("resolverAcessoLoja — URL espelha a loja ativa", () => {
  it("ok quando [lojaId] == loja ativa", () => {
    expect(resolverAcessoLoja("loja-x", "loja-x")).toEqual({ ok: true });
  });

  it("redireciona ao canônico quando [lojaId] != loja ativa (falha-fechada)", () => {
    expect(resolverAcessoLoja("loja-de-outro", "loja-x")).toEqual({
      ok: false,
      redirectTo: "/loja/loja-x",
    });
  });

  it("redireciona ao canônico para lojaId inexistente/lixo (mesma regra)", () => {
    expect(resolverAcessoLoja("../../etc", "loja-x")).toEqual({
      ok: false,
      redirectTo: "/loja/loja-x",
    });
  });
});

describe("mostrarTrocaLoja — só para usuário multi-loja", () => {
  it("esconde com 1 loja", () => {
    expect(mostrarTrocaLoja(1)).toBe(false);
  });
  it("esconde com 0 lojas", () => {
    expect(mostrarTrocaLoja(0)).toBe(false);
  });
  it("mostra com 2+ lojas", () => {
    expect(mostrarTrocaLoja(2)).toBe(true);
  });
});
