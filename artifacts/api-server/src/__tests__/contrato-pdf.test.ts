import { describe, it, expect } from "vitest";
import { gerarContratoPdf } from "../lib/contrato-pdf";

const texto = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("gerarContratoPdf", () => {
  it("gera um PDF válido com cabeçalho, EOF e os dados", () => {
    const bytes = gerarContratoPdf({ lojaNome: "Moscow Noivas", noivaNome: "Ana Lima", valorTotal: "R$ 2.000" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const txt = texto(bytes);
    expect(txt.startsWith("%PDF-1.4")).toBe(true);
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(txt).toContain("/Type /Catalog");
    expect(txt).toContain("Ana Lima");
    expect(txt).toContain("R$ 2.000");
  });

  it("escapa parênteses no texto (não quebra o stream)", () => {
    const txt = texto(gerarContratoPdf({ lojaNome: "L", noivaNome: "Maria (teste)" }));
    expect(txt).toContain("Maria \\(teste\\)");
  });

  it("usa '-' quando o campo está vazio", () => {
    const txt = texto(gerarContratoPdf({ lojaNome: "L", noivaNome: "Bia" }));
    // E220: a qualificação virou frase — "CPF nº -" é o vazio dito, não escondido.
    expect(txt).toContain("CPF nº -");
    expect(txt).toContain("Carteira de Identidade nº -");
  });

  it("renderiza o plano de pagamento quando há parcelas", () => {
    const txt = texto(
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
    );
    expect(txt).toContain("Plano de pagamento:");
    expect(txt).toContain("Entrada");
    expect(txt).toContain("Parcela 1/2");
  });

  it("renderiza o snapshot dos itens contratados", () => {
    const txt = texto(
      gerarContratoPdf({
        lojaNome: "L",
        noivaNome: "Ana",
        itens: [
          { descricao: "1x Vestido Sereia", valor: "R$ 3.000,00" },
          { descricao: "1x Barra", valor: "R$ 200,00" },
        ],
      }),
    );
    expect(txt).toContain("Itens contratados:");
    expect(txt).toContain("Vestido Sereia");
    expect(txt).toContain("Barra");
  });

  // Caracteres fora do WinAnsi não podem entrar cru no stream: a Helvetica não
  // os desenha e o leitor rejeitaria o arquivo.
  it("substitui caracteres fora do WinAnsi por '?'", () => {
    const txt = texto(gerarContratoPdf({ lojaNome: "L", noivaNome: "Ana 😀" }));
    expect(txt).toContain("Ana ?");
  });

  // A xref precisa apontar para o byte exato de cada objeto; um offset errado
  // torna o PDF ilegível em leitores estritos.
  it("escreve offsets de xref que apontam para o início de cada objeto", () => {
    const txt = texto(gerarContratoPdf({ lojaNome: "L", noivaNome: "Ana" }));
    const xrefStart = Number(txt.slice(txt.lastIndexOf("startxref") + 9, txt.lastIndexOf("%%EOF")).trim());
    expect(txt.slice(xrefStart, xrefStart + 4)).toBe("xref");

    const offsets = [...txt.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    // 1 Catalog + 1 Pages + 1 Font + 2 por página. E220: o instrumento tem 21
    // cláusulas e o papel mais curto já ocupa mais de uma página; o número de
    // páginas é lido do /Count, não fixado aqui.
    const paginas = Number(/\/Count (\d+)/.exec(txt)![1]);
    expect(paginas).toBeGreaterThanOrEqual(1);
    expect(offsets).toHaveLength(3 + 2 * paginas);
    offsets.forEach((off, i) => {
      expect(txt.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });
});
