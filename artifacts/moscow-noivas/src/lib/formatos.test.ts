import { describe, expect, it } from "vitest";
import {
  brl,
  dataDia,
  statusContratoLabel,
  statusOrcamentoLabel,
  tipoAtributoLabel,
} from "./formatos";

/**
 * brl() é o formatador de dinheiro usado em TODA tela financeira. O bug: sem
 * maximumFractionDigits, um valor com mais de 2 casas saía com 3 dígitos de
 * centavo — "R$ 1.234,567" — quebrando o alinhamento e a confiança no número.
 */
describe("brl", () => {
  it("sempre 2 casas: trunca/arredonda o que tem mais", () => {
    expect(brl(1234.567)).toBe("1.234,57");
    expect(brl(33.333333)).toBe("33,33");
    expect(brl(0.1 + 0.2)).toBe("0,30"); // 0.30000000000000004
  });

  it("sempre 2 casas: completa o que tem menos", () => {
    expect(brl(1000)).toBe("1.000,00");
    expect(brl(5)).toBe("5,00");
    expect(brl(0)).toBe("0,00");
  });

  it("separador de milhar BR (ponto)", () => {
    expect(brl(1234567.89)).toBe("1.234.567,89");
  });
});

/**
 * Labels de status: a vendedora lê "Rascunho", não RASCUNHO. O fallback devolve
 * o valor cru — um status novo no backend aparece feio, mas aparece.
 */
describe("labels de status e tipo", () => {
  it("status de orçamento em linguagem de gente", () => {
    expect(statusOrcamentoLabel("RASCUNHO")).toBe("Rascunho");
    expect(statusOrcamentoLabel("ENVIADO")).toBe("Enviado");
    expect(statusOrcamentoLabel("APROVADO")).toBe("Aprovado");
    expect(statusOrcamentoLabel("RECUSADO")).toBe("Recusado");
    expect(statusOrcamentoLabel("NOVO_STATUS")).toBe("NOVO_STATUS");
  });

  it("status de contrato em linguagem de gente", () => {
    expect(statusContratoLabel("ATIVO")).toBe("Ativo");
    expect(statusContratoLabel("CANCELADO")).toBe("Cancelado");
    expect(statusContratoLabel("OUTRO")).toBe("OUTRO");
  });

  it("tipo de atributo do catálogo", () => {
    expect(tipoAtributoLabel("ESCALA")).toBe("escala");
    expect(tipoAtributoLabel("OPCAO_UNICA")).toBe("opção única");
    expect(tipoAtributoLabel("NOVO_TIPO")).toBe("NOVO_TIPO");
  });
});

/**
 * dataDia formata uma data de NEGÓCIO (casamento, vencimento) sem deixar o
 * fuso empurrar o dia. O bug que ela previne: `toLocaleDateString("pt-BR")`
 * sem timeZone lê um `2026-11-20T00:00:00Z` no fuso local (SP, UTC-3) e
 * mostra 19/11 — o casamento aparece um dia antes do real.
 */
describe("dataDia", () => {
  it("ISO ancorado ao meio-dia SP mostra o dia certo", () => {
    expect(dataDia("2026-11-20T12:00:00-03:00")).toBe("20/11/2026");
  });

  it("date-only (meia-noite UTC) NÃO escorrega um dia para trás", () => {
    expect(dataDia("2026-11-20")).toBe("20/11/2026");
    expect(dataDia("2026-11-20T00:00:00.000Z")).toBe("20/11/2026");
  });
});
