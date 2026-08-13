import { describe, expect, it } from "vitest";
import {
  TAXA_LIMPEZA_MAXIMA,
  TAXA_LIMPEZA_MINIMA,
  TETO_DO_DANO_EM_ALUGUEIS,
  avaliarTaxaDeAvaria,
  explicacaoDaFaixa,
  faixaDaTaxaDeAvaria,
} from "@workspace/financeiro-core";

/**
 * **E214 — a taxa de limpeza e a de dano ganham faixa** (cláusulas 14ª e 15ª).
 *
 * `avarias.custo_reparo` era campo livre: R$ 50,00 e R$ 9.000,00 entravam
 * iguais, e nada dizia de qual das duas cláusulas o número tinha saído.
 *
 * **Mora aqui, e não ao lado do módulo**, pela mesma razão do irmão
 * `reajuste.test.ts`: a regra é do `financeiro-core`, que não tem suíte própria
 * — nenhum `vitest.config` alcança `lib/**`, e um teste escrito lá responde
 * "No test files found" como se estivesse tudo bem.
 */
describe("a faixa da taxa de avaria — as cláusulas 14ª e 15ª", () => {
  it("os três números são os do papel: 350, 2.500 e 5×", () => {
    expect(TAXA_LIMPEZA_MINIMA).toBe(350);
    expect(TAXA_LIMPEZA_MAXIMA).toBe(2500);
    expect(TETO_DO_DANO_EM_ALUGUEIS).toBe(5);
  });

  describe("limpeza (14ª) — faixa ABSOLUTA, não depende de contrato", () => {
    const limpeza = (valor: number | null) =>
      avaliarTaxaDeAvaria({ tipo: "LIMPEZA", valor, aluguelDaPeca: null });

    it("a faixa é a mesma com ou sem aluguel da peça", () => {
      expect(faixaDaTaxaDeAvaria({ tipo: "LIMPEZA", aluguelDaPeca: null })).toMatchObject({
        clausula: "14ª",
        piso: 350,
        teto: 2500,
        tetoIndeterminado: false,
      });
      expect(faixaDaTaxaDeAvaria({ tipo: "LIMPEZA", aluguelDaPeca: 4000 })).toMatchObject({
        piso: 350,
        teto: 2500,
      });
    });

    it("os extremos ENTRAM — a cláusula diz 'a partir de 350' e 'até 2.500'", () => {
      expect(limpeza(350)).toMatchObject({ dentroDaFaixa: true, motivo: null });
      expect(limpeza(2500)).toMatchObject({ dentroDaFaixa: true, motivo: null });
      expect(limpeza(1200)).toMatchObject({ dentroDaFaixa: true });
    });

    it("R$ 349,99 fica abaixo do piso, e R$ 2.500,01 acima do teto", () => {
      expect(limpeza(349.99)).toMatchObject({
        dentroDaFaixa: false,
        motivo: "ABAIXO_DO_PISO",
        exigeJustificativa: true,
      });
      expect(limpeza(2500.01)).toMatchObject({
        dentroDaFaixa: false,
        motivo: "ACIMA_DO_TETO",
        exigeJustificativa: true,
      });
    });

    it("R$ 50,00 — o exemplo da auditoria — pede justificativa", () => {
      expect(limpeza(50)).toMatchObject({ motivo: "ABAIXO_DO_PISO", exigeJustificativa: true });
    });
  });

  describe("dano (15ª) — teto RELATIVO à peça, e sem piso", () => {
    const dano = (valor: number | null, aluguelDaPeca: number | null) =>
      avaliarTaxaDeAvaria({ tipo: "DANO", valor, aluguelDaPeca });

    it("a 15ª não dá piso: um puído de R$ 80,00 é um dano de R$ 80,00", () => {
      // Inventar um mínimo aqui seria inventar cláusula — o texto fala em
      // "taxa a ser definida de acordo com o TIPO DE DANO".
      expect(dano(80, 3000)).toMatchObject({ piso: null, dentroDaFaixa: true, motivo: null });
    });

    it("o teto é cinco aluguéis DAQUELA peça, e o limite entra", () => {
      // Vestido alugado por R$ 3.000,00 → teto de R$ 15.000,00.
      expect(faixaDaTaxaDeAvaria({ tipo: "DANO", aluguelDaPeca: 3000 })).toMatchObject({
        clausula: "15ª",
        teto: 15000,
        tetoIndeterminado: false,
      });
      expect(dano(15000, 3000)).toMatchObject({ dentroDaFaixa: true });
      expect(dano(15000.01, 3000)).toMatchObject({
        dentroDaFaixa: false,
        motivo: "ACIMA_DO_TETO",
      });
    });

    it("o teto acompanha a peça: os R$ 9.000,00 da auditoria passam no vestido e não no véu", () => {
      // O mesmo número, as mesmas duas cláusulas, dois desfechos — é a razão
      // pela qual o teto NÃO pode ser constante.
      expect(dano(9000, 3000)).toMatchObject({ dentroDaFaixa: true }); // teto 15.000
      expect(dano(9000, 400)).toMatchObject({ motivo: "ACIMA_DO_TETO" }); // teto 2.000
    });

    it("a conta é em CENTAVOS — R$ 8.752,50 na peça de R$ 1.750,50 não perde por um centavo de float", () => {
      // `1750.5 * 5` em ponto flutuante é 8752.499999999999.
      expect(dano(8752.5, 1750.5)).toMatchObject({ dentroDaFaixa: true, motivo: null });
    });

    it("peça fora de contrato: a 15ª NÃO alcança o caso — não barra, e diz que não conferiu", () => {
      // A decisão está declarada no módulo, e ela mudou no meio do épico: a
      // cláusula limita a taxa a cinco vezes "o valor do aluguel"; onde não há
      // aluguel ela é SILENTE, não violada. Recusar ali seria inventar regra
      // que o papel não tem — e seria parede diária, porque a avaria nasce
      // presa ao bloqueio, cujo vínculo com o contrato é frouxo por desenho.
      expect(dano(1200, null)).toMatchObject({
        teto: null,
        tetoIndeterminado: true,
        conferida: false,
        motivo: "TETO_INDETERMINADO",
        dentroDaFaixa: true,
        exigeJustificativa: false,
        // E não vira silêncio: a trilha registra que nasceu número contra um
        // teto que ninguém pôde conferir.
        mereceTrilha: true,
      });
      // Aluguel zero é o mesmo caso: cinco vezes zero não é teto nenhum.
      expect(dano(1200, 0)).toMatchObject({ tetoIndeterminado: true, conferida: false });
    });

    it("violar o teto que EXISTE continua pedindo a razão escrita", () => {
      expect(dano(20000, 3000)).toMatchObject({
        motivo: "ACIMA_DO_TETO",
        conferida: true,
        exigeJustificativa: true,
        mereceTrilha: true,
      });
    });
  });

  it("avaria SEM custo passa — a cláusula governa cobrança, não registro", () => {
    // `custo_reparo` é nulável desde o E71 ("null quando ainda não avaliado"), e
    // a única porta que vira dinheiro já recusa o nulo com AVARIA_SEM_CUSTO.
    expect(avaliarTaxaDeAvaria({ tipo: "DANO", valor: null, aluguelDaPeca: null })).toMatchObject({
      dentroDaFaixa: true,
      exigeJustificativa: false,
      // Sem valor não há o que conferir e não há o que narrar: avaria sem custo
      // não cobra ninguém, então não gasta linha de trilha.
      mereceTrilha: false,
    });
    expect(avaliarTaxaDeAvaria({ tipo: "LIMPEZA", valor: 0, aluguelDaPeca: null })).toMatchObject({
      dentroDaFaixa: true,
      exigeJustificativa: false,
    });
  });

  it("a explicação cita o papel e o número, e é UMA só para tela e porta", () => {
    // O `Intl` separa "R$" do número com espaço RÍGIDO (U+00A0), e o literal
    // aqui é escrito com espaço comum de propósito: quem lê o teste tem de
    // conseguir digitar a frase. A normalização é do teste, não do código.
    const frase = (v: Parameters<typeof explicacaoDaFaixa>[0]) =>
      explicacaoDaFaixa(v).replace(/ /g, " ");
    expect(frase(avaliarTaxaDeAvaria({ tipo: "LIMPEZA", valor: 50, aluguelDaPeca: null })))
      .toBe("A taxa de limpeza vai de R$ 350,00 a R$ 2.500,00 (cláusula 14ª).");
    expect(frase(avaliarTaxaDeAvaria({ tipo: "DANO", valor: 20000, aluguelDaPeca: 3000 })))
      .toBe("O dano não pode passar de 5× o aluguel da peça — R$ 15.000,00 (cláusula 15ª).");
    expect(frase(avaliarTaxaDeAvaria({ tipo: "DANO", valor: 900, aluguelDaPeca: null })))
      .toContain("o valor entra SEM ser conferido");
  });
});
