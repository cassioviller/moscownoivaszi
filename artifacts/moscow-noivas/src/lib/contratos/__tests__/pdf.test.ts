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

  it("renderiza o plano de pagamento quando há parcelas", () => {
    const txt = Buffer.from(
      gerarContratoPdf({
        lojaNome: "L",
        noivaNome: "Ana",
        valorTotal: "R$ 3.000,00",
        formaPagamento: "Pix",
        parcelas: [
          { descricao: "Entrada", valor: "R$ 900,00", vencimento: "10/06/2026", forma: "Pix" },
          { descricao: "Parcela 1/2", valor: "R$ 1.050,00", vencimento: "10/07/2026" },
        ],
      }),
    ).toString("latin1");
    expect(txt).toContain("Plano de pagamento:");
    expect(txt).toContain("Entrada");
    expect(txt).toContain("Parcela 1/2");
  });
});
