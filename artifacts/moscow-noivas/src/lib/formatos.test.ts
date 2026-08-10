import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brl,
  capitalizar,
  diaMesAno,
  haQuanto,
  normalizar,
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

/**
 * S35 — `haQuanto` existia em três páginas (portal da noiva, backup,
 * atividade da equipe) com tetos divergentes (nenhum/90/60 dias) e nada
 * documentando a diferença. Uma função, teto por parâmetro; estes testes
 * pregam o vocabulário e os dois tetos que as telas declaram.
 */
describe("haQuanto", () => {
  afterEach(() => vi.useRealTimers());

  function agoraEm(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it("fala em min, h e dias conforme a distância", () => {
    agoraEm("2026-08-06T12:00:00Z");
    expect(haQuanto("2026-08-06T11:59:40Z")).toBe("agora há pouco");
    expect(haQuanto("2026-08-06T11:55:00Z")).toBe("há 5 min");
    expect(haQuanto("2026-08-06T09:00:00Z")).toBe("há 3 h");
    expect(haQuanto("2026-08-05T11:00:00Z")).toBe("há 1 dia");
    expect(haQuanto("2026-07-25T12:00:00Z")).toBe("há 12 dias");
  });

  it("teto em dias: dentro fala relativo, fora devolve null (data absoluta)", () => {
    agoraEm("2026-08-06T12:00:00Z");
    // Os tetos em uso: 90 (backup) e 60 (atividade da equipe).
    expect(haQuanto("2026-05-10T12:00:00Z", 90)).toBe("há 88 dias");
    expect(haQuanto("2026-05-10T12:00:00Z", 60)).toBeNull();
    // Sem teto (portal da noiva): relativo para sempre.
    expect(haQuanto("2025-01-01T12:00:00Z")).toBe("há 582 dias");
  });

  it("instante no futuro (relógio adiantado) devolve null, não 'há -3 min'", () => {
    agoraEm("2026-08-06T12:00:00Z");
    expect(haQuanto("2026-08-06T12:03:00Z")).toBeNull();
  });
});

/**
 * S35 — `normalizar` estava copiada em três telas (busca do financeiro,
 * seletor de loja, acervo de vestidos) com variações sem efeito no resultado.
 */
describe("normalizar", () => {
  it("derruba caixa e acento: 'joao' acha 'João'", () => {
    expect(normalizar("João")).toBe("joao");
    expect(normalizar("Vestido Princesa Ção")).toBe("vestido princesa cao");
    expect(normalizar("ÀÁÂÃÄàáâãä ÉÊéê ÍíÓÔÕóôõ ÚÜúü Çç")).toBe("aaaaaaaaaa eeee iioooooo uuuu cc");
  });

  it("tira espaço das pontas, preserva o do meio", () => {
    expect(normalizar("  Moscow Noivas  ")).toBe("moscow noivas");
  });
});
