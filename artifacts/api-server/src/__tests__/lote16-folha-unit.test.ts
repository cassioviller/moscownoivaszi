import { describe, expect, it } from "vitest";
import { escaparCsv, montarCsvContabilidade } from "../lib/folha";

/**
 * Onda 5 — o núcleo puro do CSV da contabilidade: uma vírgula numa descrição
 * não pode deslocar a coluna da planilha.
 *
 * A GERAÇÃO das contas morava aqui e foi para `recorrencias-unit` (E48), junto
 * com o motor — que deixou de gerar só salário.
 */

describe("Lote 16 — CSV da contabilidade (núcleo puro)", () => {
  describe("escaparCsv", () => {
    it("deixa campo simples intacto", () => {
      expect(escaparCsv("Salário 2026-07")).toBe("Salário 2026-07");
    });

    it("cita quando há vírgula", () => {
      expect(escaparCsv("Aluguel, sala 2")).toBe('"Aluguel, sala 2"');
    });

    it("cita e dobra as aspas", () => {
      expect(escaparCsv('Aluguel "sala 2"')).toBe('"Aluguel ""sala 2"""');
    });

    it("cita quando há quebra de linha", () => {
      expect(escaparCsv("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
      expect(escaparCsv("linha 1\r\nlinha 2")).toBe('"linha 1\r\nlinha 2"');
    });

    it("neutraliza fórmula: nome que abre com = vira texto", () => {
      // Sem o apóstrofo, o Excel da contabilidade executaria isto ao abrir.
      expect(escaparCsv("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
      expect(escaparCsv("@SUM(A1)")).toBe("'@SUM(A1)");
      expect(escaparCsv("+55 11 99999")).toBe("'+55 11 99999");
    });

    it("payload que abre com - vira texto, mas número negativo é preservado", () => {
      // O ataque abre com `-` mas não é número: neutraliza.
      expect(escaparCsv("-2+3+cmd|'/c calc'!A1")).toBe("'-2+3+cmd|'/c calc'!A1");
      // Valor negativo legítimo (coluna Valor) passa intacto — importação numérica.
      expect(escaparCsv("-50.00")).toBe("-50.00");
      expect(escaparCsv("1234.56")).toBe("1234.56");
    });
  });

  describe("montarCsvContabilidade", () => {
    const item = {
      // 21h de SP = 00h UTC do dia seguinte: ler o INSTANTE em UTC jogaria o
      // pagamento para 16/07 e o dia contábil fecharia errado.
      dataPagamento: new Date("2026-07-16T00:30:00.000Z"),
      colaborador: "Ana Silva",
      descricao: "Salário 2026-07",
      competencia: "2026-07",
      valor: 3000,
      forma: "PIX",
    };

    it("tem cabeçalho e uma linha por item, com o dia lido em São Paulo", () => {
      const csv = montarCsvContabilidade([item]);
      expect(csv).toBe(
        "Data,Colaborador,Descrição,Competência,Valor,Forma\r\n" +
          "15/07/2026,Ana Silva,Salário 2026-07,2026-07,3000.00,PIX\r\n",
      );
    });

    it("um campo com vírgula/aspas não desloca as colunas", () => {
      const csv = montarCsvContabilidade([
        { ...item, descricao: 'Aluguel "sala 2", julho' },
      ]);
      const linha = csv.split("\r\n")[1];
      expect(linha).toBe('15/07/2026,Ana Silva,"Aluguel ""sala 2"", julho",2026-07,3000.00,PIX');
      // A prova que importa: continuam sendo 6 colunas.
      expect(linha.match(/(^|,)("([^"]|"")*"|[^,]*)/g)).toHaveLength(6);
    });

    it("nulos viram célula vazia (sem 'null' na planilha)", () => {
      const csv = montarCsvContabilidade([
        { ...item, colaborador: null, competencia: null, forma: null },
      ]);
      expect(csv.split("\r\n")[1]).toBe("15/07/2026,,Salário 2026-07,,3000.00,");
    });

    it("valor sai com 2 casas e ponto decimal", () => {
      const csv = montarCsvContabilidade([{ ...item, valor: 1234.5 }]);
      expect(csv.split("\r\n")[1]).toContain(",1234.50,");
    });

    it("sem itens, ainda sai o cabeçalho", () => {
      expect(montarCsvContabilidade([])).toBe(
        "Data,Colaborador,Descrição,Competência,Valor,Forma\r\n",
      );
    });
  });
});
