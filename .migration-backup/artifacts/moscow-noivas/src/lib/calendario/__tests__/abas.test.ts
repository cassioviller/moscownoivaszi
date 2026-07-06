import { describe, it, expect } from "vitest";
import { ABAS, resolverAba } from "@/lib/calendario/abas";

describe("resolverAba", () => {
  it("sem aba na query → 'mes' (padrão)", () => {
    expect(resolverAba(undefined)).toBe("mes");
  });
  it("aba conhecida é preservada", () => {
    expect(resolverAba("vestidos")).toBe("vestidos");
    expect(resolverAba("atendimentos")).toBe("atendimentos");
    expect(resolverAba("provas-ajustes")).toBe("provas-ajustes");
  });
  it("aba desconhecida → 'mes'", () => {
    expect(resolverAba("xpto")).toBe("mes");
  });
  it("expõe as 4 abas na ordem certa", () => {
    expect(ABAS.map((a) => a.id)).toEqual(["mes", "vestidos", "atendimentos", "provas-ajustes"]);
  });
});
