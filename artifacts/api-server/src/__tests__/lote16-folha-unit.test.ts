import { describe, expect, it } from "vitest";
import {
  escaparCsv,
  montarContasDaFolha,
  montarCsvContabilidade,
  vencimentoDaFolha,
  type ContaSalarioExistente,
  type SalarioParaFolha,
} from "../lib/folha";

/**
 * Onda 5 — o núcleo puro da folha. Duas coisas precisam de prova rápida:
 * gerar a folha duas vezes não pode dobrar salário, e uma vírgula numa
 * descrição não pode deslocar a coluna da planilha da contabilidade.
 */

const salario = (over: Partial<SalarioParaFolha> = {}): SalarioParaFolha => ({
  id: "sal-1",
  usuarioId: "u-1",
  valor: 3000,
  diaVencimento: 5,
  ativo: true,
  ...over,
});

describe("Lote 16 — folha (núcleo puro)", () => {
  describe("montarContasDaFolha", () => {
    it("gera uma conta SALARIO por recorrência ativa, com rastro e vencimento", () => {
      const contas = montarContasDaFolha("2026-07", [salario()], []);
      expect(contas).toHaveLength(1);
      expect(contas[0]).toMatchObject({
        tipo: "SALARIO",
        colaboradorId: "u-1",
        competencia: "2026-07",
        descricao: "Salário 2026-07",
        valorPrevisto: 3000,
        salarioRecorrenteId: "sal-1",
      });
      // Data de NEGÓCIO: meio-dia SP → o dia UTC já é o dia combinado.
      expect(contas[0].vencimento.toISOString()).toBe("2026-07-05T15:00:00.000Z");
    });

    it("é idempotente: com a conta da competência já feita, gera zero", () => {
      const jaFeitas: ContaSalarioExistente[] = [
        { colaboradorId: "u-1", salarioRecorrenteId: "sal-1" },
      ];
      expect(montarContasDaFolha("2026-07", [salario()], jaFeitas)).toHaveLength(0);
    });

    it("rodar a folha duas vezes seguidas não dobra o salário", () => {
      const salarios = [salario(), salario({ id: "sal-2", usuarioId: "u-2" })];
      const primeira = montarContasDaFolha("2026-07", salarios, []);
      expect(primeira).toHaveLength(2);
      // A 2ª rodada enxerga o que a 1ª criou.
      const segunda = montarContasDaFolha("2026-07", salarios, primeira);
      expect(segunda).toHaveLength(0);
    });

    it("uma conta SALARIO lançada à mão (sem rastro) também bloqueia a geração", () => {
      // O critério é a UNIÃO rastro∪colaborador: errar para o lado de não
      // gerar é recuperável; pagar duas vezes o mesmo mês, não.
      const jaFeitas: ContaSalarioExistente[] = [
        { colaboradorId: "u-1", salarioRecorrenteId: null },
      ];
      expect(montarContasDaFolha("2026-07", [salario()], jaFeitas)).toHaveLength(0);
    });

    it("uma recorrência trocada não gera segunda conta para a mesma pessoa", () => {
      const jaFeitas: ContaSalarioExistente[] = [
        { colaboradorId: "u-1", salarioRecorrenteId: "sal-antigo" },
      ];
      expect(montarContasDaFolha("2026-07", [salario({ id: "sal-novo" })], jaFeitas)).toHaveLength(0);
    });

    it("a conta de OUTRA competência não bloqueia a folha deste mês", () => {
      // jaFeitas já vem filtrado pela competência; o mês anterior nem aparece.
      expect(montarContasDaFolha("2026-08", [salario()], [])).toHaveLength(1);
    });

    it("salário inativo fica de fora", () => {
      expect(montarContasDaFolha("2026-07", [salario({ ativo: false })], [])).toHaveLength(0);
    });

    it("gera só quem falta quando a folha foi parcialmente feita", () => {
      const salarios = [salario(), salario({ id: "sal-2", usuarioId: "u-2" })];
      const contas = montarContasDaFolha("2026-07", salarios, [
        { colaboradorId: "u-1", salarioRecorrenteId: "sal-1" },
      ]);
      expect(contas.map((c) => c.colaboradorId)).toEqual(["u-2"]);
    });
  });

  describe("vencimentoDaFolha", () => {
    it("grampeia o dia ao último do mês (dia 31 em fevereiro)", () => {
      // Sem o grampo, "2026-02-31" viraria 03/03 e a folha de fevereiro
      // venceria em março, calada.
      expect(vencimentoDaFolha("2026-02", 31).toISOString()).toBe("2026-02-28T15:00:00.000Z");
    });

    it("respeita fevereiro bissexto", () => {
      expect(vencimentoDaFolha("2024-02", 30).toISOString()).toBe("2024-02-29T15:00:00.000Z");
    });

    it("dia dentro do mês passa intacto", () => {
      expect(vencimentoDaFolha("2026-11", 10).toISOString()).toBe("2026-11-10T15:00:00.000Z");
    });
  });

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
