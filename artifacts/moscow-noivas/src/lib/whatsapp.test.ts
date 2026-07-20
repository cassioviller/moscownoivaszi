import { describe, expect, it } from "vitest";
import { msgConfirmacaoAtendimento } from "./whatsapp";

// linkWhatsApp segue testado em financeiro/cobranca.test.ts (via re-export).

describe("msgConfirmacaoAtendimento", () => {
  // 2026-07-23T17:00:00Z = 14:00 em São Paulo (UTC-3), uma quinta-feira.
  const inicio = "2026-07-23T17:00:00.000Z";

  it("fala a hora da loja (São Paulo), não a do navegador", () => {
    const msg = msgConfirmacaoAtendimento({
      noivaNome: "Ana",
      tipo: "ATENDIMENTO",
      inicio,
      lojaNome: "Moscow Noivas SP",
      endereco: "Rua das Noivas, 100",
    });
    expect(msg).toContain("Olá, Ana!");
    expect(msg).toContain("seu atendimento na Moscow Noivas SP");
    expect(msg).toContain("quinta-feira, 23/07 às 14:00");
    expect(msg).toContain("Endereço: Rua das Noivas, 100.");
  });

  it("prova fala 'sua prova'", () => {
    const msg = msgConfirmacaoAtendimento({ noivaNome: "Bia", tipo: "PROVA", inicio });
    expect(msg).toContain("sua prova");
  });

  it("sem endereço, a linha de endereço some (não sai 'Endereço: null')", () => {
    const msg = msgConfirmacaoAtendimento({ noivaNome: "Ana", tipo: "ATENDIMENTO", inicio });
    expect(msg).not.toContain("Endereço");
  });

  it("sem nome nem loja, ainda sai uma frase inteira", () => {
    const msg = msgConfirmacaoAtendimento({ inicio });
    expect(msg).toContain("Olá, noiva!");
    expect(msg).not.toContain(" na :");
  });
});
