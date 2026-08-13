import { describe, expect, it } from "vitest";
import {
  PERCENTUAIS_DA_TROCA_DE_DATA,
  percentualDaTrocaDeData,
  reajusteDaTrocaDeData,
  trocaParaAnoSeguinte,
} from "@workspace/financeiro-core";

/**
 * E211 — **a data que muda tem preço** (cláusula 17ª §§2º e 3º).
 *
 * A cláusula é a única regra do contrato que faz o ateliê **perder dinheiro**
 * por não estar no sistema: toda troca de data para o ano seguinte deveria somar
 * 10% ao contrato, 20% na segunda e 30% na terceira, e hoje some.
 *
 * **Mora aqui, e não ao lado do módulo.** A regra é do `financeiro-core`, que
 * não tem suíte própria: nenhum `vitest.config` alcança `lib/**`. Um teste
 * escrito lá não roda em lugar nenhum e o vitest responde "No test files found"
 * como se estivesse tudo bem — é o silêncio que o config do frontend documenta
 * em S15. Os irmãos (`projecao`, `parcial`, `auditoria-espelho`) moram aqui
 * pela mesma razão.
 */
describe("reajuste da troca de data — a escada do §3º", () => {
  it("a escada é 10 · 20 · 30, e a terceira se repete daí em diante", () => {
    expect([...PERCENTUAIS_DA_TROCA_DE_DATA]).toEqual([10, 20, 30]);
    expect(percentualDaTrocaDeData(0)).toBe(10); // 1ª troca
    expect(percentualDaTrocaDeData(1)).toBe(20); // 2ª
    expect(percentualDaTrocaDeData(2)).toBe(30); // 3ª
    // O contrato nomeia até a terceira e não diz o que vem depois. Repetir o
    // último degrau é o que o texto sustenta; escalar seria inventar cláusula.
    expect(percentualDaTrocaDeData(3)).toBe(30);
    expect(percentualDaTrocaDeData(9)).toBe(30);
  });

  it("negativo não quebra a escada — a porta nunca deveria mandar, e a régua não confia", () => {
    expect(percentualDaTrocaDeData(-1)).toBe(10);
  });
});

describe("trocaParaAnoSeguinte — a condição do §2º, pelo ANO CIVIL", () => {
  it("dezembro para janeiro seguinte CONTA — seis semanas de calendário, um ano a mais de guarda", () => {
    expect(trocaParaAnoSeguinte("2027-12-18", "2028-01-15")).toBe(true);
  });

  it("janeiro para dezembro do MESMO ano não conta, ainda que sejam onze meses", () => {
    expect(trocaParaAnoSeguinte("2027-01-10", "2027-12-20")).toBe(false);
  });

  it("adiar dois anos conta uma vez — a cláusula é sobre mudar de ano, não sobre quantos", () => {
    expect(trocaParaAnoSeguinte("2027-05-01", "2029-05-01")).toBe(true);
  });

  it("antecipar para o ano anterior NÃO cobra", () => {
    expect(trocaParaAnoSeguinte("2028-05-01", "2027-05-01")).toBe(false);
  });
});

describe("reajusteDaTrocaDeData — a conta, em centavos", () => {
  const BASE = { deDia: "2027-09-05", paraDia: "2028-09-05", valorTotal: 5000 };

  it("primeira troca de R$ 5.000,00 soma R$ 500,00", () => {
    const r = reajusteDaTrocaDeData({ ...BASE, trocasCobradasAntes: 0 });
    expect(r).toMatchObject({ percentual: 10, valor: 500, valorC: 50_000 });
  });

  it("segunda soma R$ 1.000,00 e terceira R$ 1.500,00 — sempre sobre o TOTAL", () => {
    expect(reajusteDaTrocaDeData({ ...BASE, trocasCobradasAntes: 1 })!.valor).toBe(1000);
    expect(reajusteDaTrocaDeData({ ...BASE, trocasCobradasAntes: 2 })!.valor).toBe(1500);
    expect(reajusteDaTrocaDeData({ ...BASE, trocasCobradasAntes: 5 })!.valor).toBe(1500);
  });

  it("troca dentro do mesmo ano devolve null — e null é a resposta CERTA, não erro", () => {
    expect(
      reajusteDaTrocaDeData({ ...BASE, paraDia: "2027-11-20", trocasCobradasAntes: 0 }),
    ).toBeNull();
  });

  /**
   * A razão de a conta morar em centavos. `1282.35 * 10 / 100` em ponto
   * flutuante devolve `128.23500000000001`; arredondar em reais depois de
   * dividir espalha o erro pela soma do contrato. Em centavos há um
   * arredondamento só, no fim.
   */
  it("o centavo não escapa: R$ 1.282,35 a 10% dá R$ 128,24, não 128,235", () => {
    const r = reajusteDaTrocaDeData({ ...BASE, valorTotal: 1282.35, trocasCobradasAntes: 0 });
    expect(r!.valorC).toBe(12_824);
    expect(r!.valor).toBe(128.24);
  });

  it("contrato de valor zero não gera cobrança de zero", () => {
    expect(reajusteDaTrocaDeData({ ...BASE, valorTotal: 0, trocasCobradasAntes: 0 })).toBeNull();
  });

  it("a conta devolve quantas trocas já tinham sido cobradas — é o que a tela mostra", () => {
    expect(reajusteDaTrocaDeData({ ...BASE, trocasCobradasAntes: 2 })!.trocasCobradasAntes).toBe(2);
  });
});
