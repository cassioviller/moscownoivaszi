// Unit (puro): faixaDeAtraso classifica por dias; linkWhatsApp monta o deep-link wa.me.
import { describe, it, expect } from "vitest";
import { faixaDeAtraso, linkWhatsApp } from "@/lib/financeiro/cobranca";

describe("faixaDeAtraso", () => {
  it("1 e 30 dias → ate30", () => {
    expect(faixaDeAtraso(1)).toBe("ate30");
    expect(faixaDeAtraso(30)).toBe("ate30");
  });
  it("31 e 60 dias → d31a60", () => {
    expect(faixaDeAtraso(31)).toBe("d31a60");
    expect(faixaDeAtraso(60)).toBe("d31a60");
  });
  it("61+ dias → mais60", () => {
    expect(faixaDeAtraso(61)).toBe("mais60");
    expect(faixaDeAtraso(200)).toBe("mais60");
  });
});

describe("linkWhatsApp", () => {
  it("monta wa.me com DDI 55 e mensagem encodada", () => {
    expect(linkWhatsApp("(11) 99999-8888", "Olá Ana!")).toBe("https://wa.me/5511999998888?text=Ol%C3%A1%20Ana!");
  });
  it("sem whatsapp → null", () => {
    expect(linkWhatsApp(null, "x")).toBeNull();
    expect(linkWhatsApp("", "x")).toBeNull();
  });
});
