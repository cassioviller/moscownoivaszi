import { describe, expect, it } from "vitest";
import { formatarWhatsApp, whatsappUtilizavel, linkWhatsApp } from "./whatsapp";

/**
 * S-O43 — o cadastro não aceita mais o número que apaga os botões.
 *
 * O defeito foi achado ao PRINTAR o manual: a legenda dizia "o WhatsApp se
 * formata sozinho", a captura provou que não formatava, e puxar o fio mostrou
 * que também ninguém conferia.
 */
describe("o WhatsApp do cadastro da noiva", () => {
  it("aceita vazio — WhatsApp é opcional", () => {
    expect(whatsappUtilizavel("")).toBe(true);
    expect(whatsappUtilizavel(null)).toBe(true);
    expect(whatsappUtilizavel("   ")).toBe(true);
  });

  it("aceita o que vira link: 10 e 11 dígitos, com ou sem pontuação", () => {
    expect(whatsappUtilizavel("(11) 96222-0147")).toBe(true);
    expect(whatsappUtilizavel("11962220147")).toBe(true);
    expect(whatsappUtilizavel("(11) 3062-4400")).toBe(true);
    expect(whatsappUtilizavel("5511962220147")).toBe(true);
  });

  it("RECUSA o que apagaria os botões em silêncio", () => {
    // Nove dígitos: o caso do DDD esquecido.
    expect(whatsappUtilizavel("962220147")).toBe(false);
    expect(whatsappUtilizavel("1196222014")).toBe(true); // 10 = fixo com DDD
    expect(whatsappUtilizavel("119622201")).toBe(false);
    expect(whatsappUtilizavel("não tem")).toBe(false);
  });

  /**
   * A trava que impede as duas de divergirem: a conferência é derivada do
   * link, então nenhum número aceito pelo cadastro pode ficar sem botão.
   */
  it("nunca aceita um número que o `linkWhatsApp` recusaria", () => {
    for (const n of ["962220147", "11962220147", "5511962220147", "1", "", "0000000000000000"]) {
      if (whatsappUtilizavel(n) && n.trim()) {
        expect(linkWhatsApp(n, "oi")).not.toBeNull();
      }
    }
  });

  it("formata enquanto se digita, sem completar o que não foi digitado", () => {
    expect(formatarWhatsApp("11")).toBe("(11");
    expect(formatarWhatsApp("1196")).toBe("(11) 96");
    expect(formatarWhatsApp("11962220147")).toBe("(11) 96222-0147");
    expect(formatarWhatsApp("1130624400")).toBe("(11) 3062-4400");
    expect(formatarWhatsApp("(11) 96222-0147")).toBe("(11) 96222-0147");
  });
});
