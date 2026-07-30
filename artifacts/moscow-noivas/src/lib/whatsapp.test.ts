import { describe, expect, it } from "vitest";
import {
  msgConfirmacaoAtendimento,
  msgCobranca,
  msgOrcamentoVencendo,
  msgDaNoivaParaAtelier,
  linkWhatsApp,
} from "./whatsapp";

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

/**
 * E84: o link do portal entra como ÚLTIMA linha quando existe — e a mensagem
 * fica exatamente como era quando não existe (nada de "aqui: null").
 */
describe("linha do portal (E84)", () => {
  const url = "https://loja.exemplo/noiva/tok123";

  it("cobrança, confirmação e orçamento levam o link quando há portal", () => {
    expect(
      msgCobranca({ totalVencido: 100, diasMaisAntigo: 3, portalUrl: url }),
    ).toContain(`Tudo sobre o seu vestido está aqui: ${url}`);
    expect(
      msgConfirmacaoAtendimento({ inicio: new Date("2026-07-23T17:00:00Z"), portalUrl: url }),
    ).toContain(url);
    expect(
      msgOrcamentoVencendo({ validade: new Date("2026-07-25T12:00:00Z"), portalUrl: url }),
    ).toContain(url);
  });

  it("sem portal a mensagem fica como era", () => {
    for (const msg of [
      msgCobranca({ totalVencido: 100, diasMaisAntigo: 3 }),
      msgCobranca({ totalVencido: 100, diasMaisAntigo: 3, portalUrl: null }),
      msgConfirmacaoAtendimento({ inicio: new Date("2026-07-23T17:00:00Z") }),
      msgOrcamentoVencendo({ validade: new Date("2026-07-25T12:00:00Z") }),
    ]) {
      expect(msg).not.toContain("Tudo sobre o seu vestido");
      expect(msg).not.toContain("null");
    }
  });
});

/**
 * F35/E100 — a única mensagem que anda no sentido contrário: da noiva para o
 * atelier, disparada pelo rodapé do portal.
 */
describe("msgDaNoivaParaAtelier", () => {
  it("põe o nome dela na primeira linha — quem atende o número da LOJA não sabe quem chegou", () => {
    expect(msgDaNoivaParaAtelier("Marina")).toContain("Aqui é a Marina");
  });

  it("sem nome, a mensagem continua enviável e não diz 'null'", () => {
    for (const msg of [
      msgDaNoivaParaAtelier(null),
      msgDaNoivaParaAtelier(undefined),
      msgDaNoivaParaAtelier("   "),
    ]) {
      expect(msg).not.toContain("null");
      expect(msg).not.toContain("undefined");
      expect(msg).toContain("Vim pelo meu link");
    }
  });

  it("sobrevive ao encode do wa.me — o link sai inteiro com acento e espaço", () => {
    const url = linkWhatsApp("11987654321", msgDaNoivaParaAtelier("Ana Letícia"));
    expect(url).toContain("wa.me/5511987654321");
    expect(decodeURIComponent(url!.split("?text=")[1])).toContain("Aqui é a Ana Letícia");
  });
});
