import { describe, expect, it } from "vitest";
import {
  instanteCurto,
  instanteHora,
  instanteDiaMes,
  instanteLongo,
  diaMesAno,
  diaMesAbrevAno,
  mesAnoLongo,
} from "./formatos";

/**
 * D15/E99 — o fuso é a decisão, e é ela que este arquivo defende.
 *
 * Um sweep de formatação erra em silêncio: nada quebra, a tela só mostra o dia
 * errado. Os casos abaixo são todos escolhidos na FRONTEIRA, onde o fuso muda a
 * resposta — 23h de São Paulo já é o dia seguinte em UTC, e meia-noite UTC ainda
 * é a véspera em São Paulo. Um formatador sem `timeZone` passa nos casos do meio
 * do dia e falha nestes.
 */

/** 21h de 28/07 em São Paulo é 00h de 29/07 em UTC. */
const NOITE_SP = "2026-07-29T00:30:00Z";

/** 00h30 de 29/07 em UTC ainda é 21h30 de 28/07 em São Paulo. */
describe("instantes — o relógio da LOJA, não o de quem abre", () => {
  it("a hora sai no fuso da loja, mesmo virando o dia em UTC", () => {
    expect(instanteHora(NOITE_SP)).toBe("21:30");
  });

  it("o dia do instante é o da loja", () => {
    expect(instanteDiaMes(NOITE_SP)).toBe("28/07");
    // A vírgula é do ICU e fica: é o que as quatro telas já mostravam, e o
    // `rotuloContato` da cobrança conta com ela (troca ", " por " às ").
    expect(instanteCurto(NOITE_SP)).toBe("28/07/2026, 21:30");
  });

  it("a data por extenso das telas públicas também", () => {
    expect(instanteLongo(NOITE_SP)).toBe("28 de julho de 2026");
  });

  it("aceita Date e string ISO com o mesmo resultado", () => {
    expect(instanteHora(new Date(NOITE_SP))).toBe(instanteHora(NOITE_SP));
  });
});

describe("dias de negócio — a data não escorrega para a véspera", () => {
  it('"2026-11-20" é 20/11, e não 19/11', () => {
    expect(diaMesAno("2026-11-20")).toBe("20/11/2026");
    expect(diaMesAbrevAno("2026-11-20")).toBe("20 de nov. de 2026");
  });

  it("o primeiro dia do mês continua sendo o primeiro", () => {
    // Sem a âncora ao meio-dia, "2026-01-01" lido em SP vira 31/12/2025 — o
    // caso em que o erro troca o ANO, não só o dia.
    expect(diaMesAno("2026-01-01")).toBe("01/01/2026");
  });

  it("a competência vira mês por extenso, em minúscula (E92)", () => {
    expect(mesAnoLongo("2026-07-15")).toBe("julho de 2026");
  });
});
