import { describe, it, expect } from "vitest";
import { gerarContratoPdf } from "@/lib/contratos/pdf";

describe("gerarContratoPdf", () => {
  it("gera um PDF válido com cabeçalho, EOF e os dados", () => {
    const bytes = gerarContratoPdf({ lojaNome: "Moscow Noivas", noivaNome: "Ana Lima", valorTotal: "R$ 2.000" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const txt = Buffer.from(bytes).toString("latin1");
    expect(txt.startsWith("%PDF-1.4")).toBe(true);
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(txt).toContain("/Type /Catalog");
    expect(txt).toContain("Ana Lima");
    expect(txt).toContain("R$ 2.000");
  });

  it("escapa parênteses no texto (não quebra o stream)", () => {
    const txt = Buffer.from(gerarContratoPdf({ lojaNome: "L", noivaNome: "Maria (teste)" })).toString("latin1");
    expect(txt).toContain("Maria \\(teste\\)");
  });

  it("usa '-' quando o campo está vazio", () => {
    const txt = Buffer.from(gerarContratoPdf({ lojaNome: "L", noivaNome: "Bia" })).toString("latin1");
    expect(txt).toContain("CPF: -");
  });
});
