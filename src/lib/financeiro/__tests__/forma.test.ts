import { describe, it, expect } from "vitest";
import { formaValida, rotuloForma, FORMAS } from "@/lib/financeiro/forma";

describe("forma", () => {
  it("formaValida aceita os 7 valores do enum e rejeita o resto", () => {
    for (const f of ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "BOLETO", "TRANSFERENCIA", "OUTRO"]) {
      expect(formaValida(f)).toBe(true);
    }
    expect(formaValida("")).toBe(false);
    expect(formaValida("Pix + 2x")).toBe(false);
    expect(formaValida("pix")).toBe(false);
  });
  it("rotuloForma traduz para PT-BR", () => {
    expect(rotuloForma("PIX")).toBe("Pix");
    expect(rotuloForma("CARTAO_CREDITO")).toBe("Cartão de crédito");
    expect(rotuloForma("CARTAO_DEBITO")).toBe("Cartão de débito");
    expect(rotuloForma("TRANSFERENCIA")).toBe("Transferência");
  });
  it("FORMAS lista os 7 em ordem", () => {
    expect(FORMAS).toHaveLength(7);
    expect(FORMAS[0]).toBe("PIX");
  });
});
