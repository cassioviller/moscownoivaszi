import { describe, expect, it } from "vitest";
import {
  brl,
  capitalizar,
  diaMesAno,
  perdidaMotivoLabel,
  statusContratoLabel,
  statusOrcamentoLabel,
  tipoAtributoLabel,
} from "./formatos";

/**
 * brl() é o formatador de dinheiro usado em TODA tela financeira, e desde o
 * E92 é a régua ÚNICA: ela devolve o valor JÁ com o "R$". Dois bugs vivem
 * nestes testes — sem maximumFractionDigits um valor com mais de 2 casas saía
 * com 3 dígitos de centavo ("R$ 1.234,567"), e com o "R$" escrito à mão nas
 * telas o espaço era comum, então em 390px o navegador quebrava linha entre o
 * símbolo e o número e o card de dinheiro dobrava de altura.
 */
describe("brl", () => {
  it("traz o R$ junto — nenhuma tela precisa (nem deve) escrevê-lo à mão", () => {
    expect(brl(1200)).toBe("R$\u00a01.200,00");
    expect(brl(0)).toBe("R$\u00a00,00");
  });

  it("o espaço entre R$ e o número é RÍGIDO (U+00A0), não um espaço comum", () => {
    // É este caractere que impede a quebra de linha no celular. Um espaço
    // normal aqui reabre o E5 em 98 telas de uma vez.
    expect(brl(13500)).toContain("\u00a0");
    expect(brl(13500)).not.toContain("R$ 13.500,00"); // espaço comum: proibido
  });

  it("negativo põe o sinal ANTES do símbolo, como manda o português", () => {
    // "R$ -500,00" era o que saía quando o prefixo era escrito à mão na tela.
    expect(brl(-500)).toBe("-R$\u00a0500,00");
  });

  it("sempre 2 casas: trunca/arredonda o que tem mais", () => {
    expect(brl(1234.567)).toBe("R$\u00a01.234,57");
    expect(brl(33.333333)).toBe("R$\u00a033,33");
    expect(brl(0.1 + 0.2)).toBe("R$\u00a00,30"); // 0.30000000000000004
  });

  it("sempre 2 casas: completa o que tem menos", () => {
    expect(brl(1000)).toBe("R$\u00a01.000,00");
    expect(brl(5)).toBe("R$\u00a05,00");
  });

  it("separador de milhar BR (ponto)", () => {
    expect(brl(1234567.89)).toBe("R$\u00a01.234.567,89");
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
 * diaMesAno formata uma data de NEGÓCIO (casamento, vencimento) sem deixar o
 * fuso empurrar o dia. O bug que ela previne: `toLocaleDateString("pt-BR")`
 * sem timeZone lê um `2026-11-20T00:00:00Z` no fuso local (SP, UTC-3) e
 * mostra 19/11 — o casamento aparece um dia antes do real.
 */
describe("diaMesAno", () => {
  it("ISO ancorado ao meio-dia SP mostra o dia certo", () => {
    expect(diaMesAno("2026-11-20T12:00:00-03:00")).toBe("20/11/2026");
  });

  it("date-only (meia-noite UTC) NÃO escorrega um dia para trás", () => {
    expect(diaMesAno("2026-11-20")).toBe("20/11/2026");
    expect(diaMesAno("2026-11-20T00:00:00.000Z")).toBe("20/11/2026");
  });
});

describe("perdidaMotivoLabel", () => {
  it("motivo de perda em linguagem de gente, nunca a chave crua", () => {
    expect(perdidaMotivoLabel("PRECO")).toBe("Preço");
    expect(perdidaMotivoLabel("DATA_INDISPONIVEL")).toBe("Data indisponível");
    expect(perdidaMotivoLabel("SEM_RETORNO")).toBe("Parou de responder");
  });

  it("motivo novo do backend aparece feio, mas aparece", () => {
    expect(perdidaMotivoLabel("MUDANCA_DE_CIDADE")).toBe("MUDANCA_DE_CIDADE");
  });
});

/**
 * E92/E15: o `className="capitalize"` do CSS sobe a inicial de TODA palavra.
 * No card mais importante de /comissoes ele produzia, literalmente, "Julho De
 * 2026 — O Que Seria Pago Se Fechasse Agora." — Title Case é convenção
 * inglesa; em português lê-se como texto de máquina.
 */
describe("capitalizar", () => {
  it("sobe só a PRIMEIRA letra da frase, nunca a de cada palavra", () => {
    expect(capitalizar("julho de 2026 — o que seria pago se fechasse agora.")).toBe(
      "Julho de 2026 — o que seria pago se fechasse agora.",
    );
    expect(capitalizar("sexta-feira, 20 de novembro de 2026")).toBe(
      "Sexta-feira, 20 de novembro de 2026",
    );
  });

  it("não estraga o que já está certo, nem quebra com string vazia", () => {
    expect(capitalizar("Julho de 2026")).toBe("Julho de 2026");
    expect(capitalizar("")).toBe("");
  });
});
