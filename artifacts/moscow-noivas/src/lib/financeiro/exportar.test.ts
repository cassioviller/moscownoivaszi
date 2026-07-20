import { describe, expect, it } from "vitest";
import { escaparCsv, montarCsv, linhasDre, linhasFluxo } from "./exportar";
import type { DRE } from "./dre";
import type { Movimento } from "./fluxo";

/**
 * O espelho do csv.ts do api-server precisa de fiscal (lição do E12): estas
 * provas fixam as MESMAS regras validadas em lote16-folha-unit (C5) — se um
 * lado mudar a régua, o teste denuncia.
 */

describe("escaparCsv — espelho do api-server (C5)", () => {
  it("neutraliza injeção de fórmula com apóstrofo", () => {
    expect(escaparCsv("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(escaparCsv("+55 11 9999")).toBe("'+55 11 9999");
    expect(escaparCsv("@planilha")).toBe("'@planilha");
  });

  it("preserva números legítimos, inclusive negativos", () => {
    expect(escaparCsv("-50.00")).toBe("-50.00");
    expect(escaparCsv("1234.56")).toBe("1234.56");
  });

  it("aspas e vírgulas seguem RFC 4180", () => {
    expect(escaparCsv('Aluguel "sala 2", jul')).toBe('"Aluguel ""sala 2"", jul"');
  });

  it("montarCsv usa CRLF e termina com quebra", () => {
    expect(montarCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d\r\n");
  });
});

describe("linhasDre / linhasFluxo", () => {
  it("DRE sai como a tela: despesas e total negativos, resultado com sinal", () => {
    const dre: DRE = {
      receitas: 1000,
      despesas: [
        { rotulo: "Salários", total: 700 },
        { rotulo: "Aluguel", total: 500 },
      ],
      totalDespesas: 1200,
      resultado: -200,
    };
    const linhas = linhasDre(dre, "2026-06");
    expect(linhas[1]).toEqual(["2026-06", "Recebimentos", "1000.00"]);
    expect(linhas[2]).toEqual(["2026-06", "Despesa — Salários", "-700.00"]);
    expect(linhas[4]).toEqual(["2026-06", "Total de despesas", "-1200.00"]);
    expect(linhas[5]).toEqual(["2026-06", "Resultado", "-200.00"]);
  });

  it("fluxo: um movimento por linha, saída negativa, dia local na data", () => {
    const movs: Movimento[] = [
      {
        id: "parcela-1",
        tipo: "ENTRADA",
        data: "2026-07-10T14:00:00.000Z",
        valor: 500,
        descricao: "Parcela 1",
        rotulo: "Helena",
        href: null,
      },
      {
        id: "pagamento-1",
        tipo: "SAIDA",
        data: "2026-07-11T14:00:00.000Z",
        valor: 200,
        descricao: "Aluguel",
        rotulo: null,
        href: null,
      },
    ];
    const linhas = linhasFluxo(movs);
    expect(linhas[0]).toEqual(["Data", "Tipo", "Descrição", "Quem", "Valor"]);
    expect(linhas[1]).toEqual(["2026-07-10", "Entrada", "Parcela 1", "Helena", "500.00"]);
    expect(linhas[2]).toEqual(["2026-07-11", "Saída", "Aluguel", "", "-200.00"]);
  });
});
