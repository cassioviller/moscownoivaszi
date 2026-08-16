import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_EXTRAVIO,
  MULTA_DE_ATRASO,
  MULTIPLICADOR_DE_EXTRAVIO,
  cobrancaDoAtraso,
  diariaEmCentavos,
  diasDeAtraso,
  explicacaoDoAtraso,
  tipoDoAtraso,
  fimPrevistoDaDevolucao,
} from "@workspace/financeiro-core";

/**
 * **E212 — o atraso na devolução tem preço** (cláusula 16ª e seus dois §§).
 *
 * O sistema já enxergava o atraso desde sempre — `disponibilidade.ts` pinta a
 * janela como `ATRASO_DEVOLUCAO` quando há retirada sem devolução depois do fim
 * do uso previsto — e **nenhuma cobrança nascia**. A peça aparecia vermelha na
 * tela e a conta não existia em lugar nenhum.
 *
 * **Mora aqui, e não ao lado do módulo**, pela mesma razão dos irmãos
 * `reajuste.test.ts` e `avaria.test.ts`: nenhum `vitest.config` alcança `lib/**`,
 * e um teste escrito lá responde "No test files found" como se estivesse tudo
 * bem.
 *
 * A loja padrão aluga por **6 dias** (`usoDiasAntes` 3 + o dia do casamento +
 * `usoDiasDepois` 2), e é esse o divisor da diária em todos os casos abaixo.
 */

const VESTIDO = { descricao: "Vestido Serena", aluguel: 3000, diasDeAluguel: 6 };
const VEU = { descricao: "Véu longo", aluguel: 400, diasDeAluguel: 6 };

describe("diasDeAtraso — o dia do fim previsto ainda é dentro do prazo", () => {
  it("devolver no fim do uso previsto é zero, não um", () => {
    expect(diasDeAtraso("2028-09-07", "2028-09-07")).toBe(0);
  });

  it("devolver antes também é zero — nunca negativo", () => {
    expect(diasDeAtraso("2028-09-07", "2028-09-04")).toBe(0);
  });

  it("cada dia depois é um dia", () => {
    expect(diasDeAtraso("2028-09-07", "2028-09-08")).toBe(1);
    expect(diasDeAtraso("2028-09-07", "2028-09-16")).toBe(9);
  });

  it("atravessa a virada do mês e a do ano sem contar errado", () => {
    expect(diasDeAtraso("2028-12-30", "2029-01-03")).toBe(4);
  });
});

/**
 * E244 — o dia até o qual a peça pode estar fora sem atraso é o que o PAPEL
 * manda, senão a janela. Casamento sábado 12/09/2026, `usoDiasDepois = 2`:
 * a janela termina segunda 14/09 (fechado no padrão da loja) e o E224 imprime
 * a devolução na terça 15/09 às 18:00. Contar da janela cobrava R$ 750,00 de
 * quem devolveu no dia do papel.
 */
describe("fimPrevistoDaDevolucao — o papel manda, senão a janela (E244)", () => {
  it("com a data do contrato, o fim previsto é o DIA dela em São Paulo — não a janela", () => {
    expect(
      fimPrevistoDaDevolucao({
        casamentoData: "2026-09-12",
        usoDiasDepois: 2,
        dataDevolucao: "2026-09-15T21:00:00.000Z", // 18:00 em SP
      }),
    ).toBe("2026-09-15");
    // E o dia é o de SP: 15/09 às 23:30 SP já é 16/09 em UTC.
    expect(
      fimPrevistoDaDevolucao({ casamentoData: "2026-09-12", usoDiasDepois: 2, dataDevolucao: "2026-09-16T02:30:00.000Z" }),
    ).toBe("2026-09-15");
  });
  it("sem a data do contrato (anterior ao E224, ou órfã), a janela continua sendo a régua", () => {
    expect(fimPrevistoDaDevolucao({ casamentoData: "2026-09-12", usoDiasDepois: 2, dataDevolucao: null })).toBe("2026-09-14");
    expect(fimPrevistoDaDevolucao({ casamentoData: "2026-09-12", usoDiasDepois: 2 })).toBe("2026-09-14");
  });
  it("devolver no dia do papel é zero dias — e um dia depois é UM, não três", () => {
    const fim = fimPrevistoDaDevolucao({ casamentoData: "2026-09-12", usoDiasDepois: 2, dataDevolucao: "2026-09-15T21:00:00.000Z" });
    expect(diasDeAtraso(fim, "2026-09-15")).toBe(0);
    expect(diasDeAtraso(fim, "2026-09-16")).toBe(1);
  });
});

describe("as duas faixas da 16ª são exclusivas — o §1º só vale abaixo do caput", () => {
  it("de 1 a 9 dias é atraso", () => {
    expect(tipoDoAtraso(1)).toBe("ATRASO");
    expect(tipoDoAtraso(DIAS_PARA_EXTRAVIO - 1)).toBe("ATRASO");
  });

  it("dez dias já é extravio", () => {
    expect(tipoDoAtraso(DIAS_PARA_EXTRAVIO)).toBe("EXTRAVIO");
    expect(tipoDoAtraso(40)).toBe("EXTRAVIO");
  });
});

describe("a diária é o aluguel dividido pelos dias da janela (decisão da dona, 13/08/2026)", () => {
  it("R$ 3.000,00 em 6 dias dá R$ 500,00 por dia", () => {
    expect(diariaEmCentavos(3000, 6)).toBe(50_000);
  });

  it("o véu de R$ 400,00 tem a diária DELE — o §2º rateia por peça", () => {
    expect(diariaEmCentavos(400, 6)).toBe(6_667);
  });

  it("janela inválida não vira divisão por zero", () => {
    expect(diariaEmCentavos(3000, 0)).toBe(0);
  });
});

describe("cobrancaDoAtraso — a conta, e a escada que ela tem de subir", () => {
  it("devolução no prazo não cobra nada, e `null` não é erro", () => {
    expect(cobrancaDoAtraso([{ ...VESTIDO, dias: 0 }])).toBeNull();
    expect(cobrancaDoAtraso([])).toBeNull();
  });

  it("um dia de atraso do vestido: R$ 500,00 + a multa de R$ 250,00", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 1 }])!;
    expect(c.linhas[0]!.valor).toBe(500);
    expect(c.multa).toBe(MULTA_DE_ATRASO);
    expect(c.valor).toBe(750);
  });

  it("nove dias — o último degrau do §1º — sai R$ 4.750,00", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 9 }])!;
    expect(c.linhas[0]!.clausula).toBe("16ª §1º");
    expect(c.valor).toBe(4750);
  });

  /**
   * **A prova de que a leitura da diária está certa.** Com a outra leitura
   * ("uma diária é o aluguel inteiro") nove dias custariam R$ 27.250,00 e o
   * décimo devolveria R$ 15.250,00 ao locatário. Este par de asserts é o que
   * quebra se alguém trocar o divisor sem pensar na escada.
   */
  it("o décimo dia CUSTA MAIS que o nono — a escada do contrato sobe", () => {
    const nove = cobrancaDoAtraso([{ ...VESTIDO, dias: 9 }])!;
    const dez = cobrancaDoAtraso([{ ...VESTIDO, dias: 10 }])!;
    expect(nove.valor).toBe(4750);
    expect(dez.valor).toBe(12_000);
    expect(dez.valor).toBeGreaterThan(nove.valor);
  });

  it("extravio é 4× o aluguel e NÃO leva a multa — o caput não a menciona", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 12 }])!;
    expect(c.linhas[0]!.tipo).toBe("EXTRAVIO");
    expect(c.linhas[0]!.clausula).toBe("16ª");
    expect(c.linhas[0]!.valor).toBe(3000 * MULTIPLICADOR_DE_EXTRAVIO);
    expect(c.multa).toBe(0);
    expect(c.valor).toBe(12_000);
    expect(c.temExtravio).toBe(true);
  });

  it("§2º — três peças atrasadas pagam três diárias e UMA multa, não três", () => {
    const c = cobrancaDoAtraso([
      { ...VESTIDO, dias: 2 },
      { ...VEU, dias: 2 },
      { descricao: "Tiara", aluguel: 200, diasDeAluguel: 6, dias: 2 },
    ])!;
    expect(c.linhas).toHaveLength(3);
    expect(c.multa).toBe(250);
    // 2 × 500,00 + 2 × 66,67 + 2 × 33,33 = 1.000,00 + 133,34 + 66,66
    expect(c.valor).toBe(1000 + 133.34 + 66.66 + 250);
  });

  it("a peça devolvida no prazo não entra na conta das que atrasaram", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 3 }, { ...VEU, dias: 0 }])!;
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0]!.descricao).toBe("Vestido Serena");
  });

  /**
   * O caso misto é o que prova que as duas faixas convivem numa cobrança só: o
   * vestido sumiu (12 dias, extravio) e o véu voltou atrasado (3 dias). A multa
   * entra porque ALGUMA peça caiu na faixa do §1º.
   */
  it("misto: uma peça extraviada e outra atrasada — a multa entra pela atrasada", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 12 }, { ...VEU, dias: 3 }])!;
    expect(c.linhas.map((l) => l.tipo)).toEqual(["EXTRAVIO", "ATRASO"]);
    expect(c.multa).toBe(250);
    // 4 × 3.000,00 + 3 × 66,67 + 250,00
    expect(c.valor).toBe(12_000 + 200.01 + 250);
    expect(c.maiorAtraso).toBe(12);
  });

  it("todas extraviadas: nenhuma multa, porque o §1º não alcança nenhuma", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 15 }, { ...VEU, dias: 11 }])!;
    expect(c.multa).toBe(0);
    expect(c.valor).toBe(12_000 + 1600);
  });

  /**
   * A conta impressa TEM de fechar na multiplicação que a vendedora faz no
   * papel — é por isso que a diária arredonda antes de multiplicar, e não
   * depois. O véu é o caso que denuncia: R$ 400,00 / 6 = R$ 66,666…
   */
  it("a diária impressa × os dias é EXATAMENTE o valor cobrado", () => {
    const c = cobrancaDoAtraso([{ ...VEU, dias: 9 }])!;
    const linha = c.linhas[0]!;
    expect(linha.diaria).toBe(66.67);
    expect(Math.round(linha.diaria * linha.dias * 100)).toBe(Math.round(linha.valor * 100));
    expect(linha.valor).toBe(600.03);
  });
});

/**
 * **O `brl` separa "R$" do número com ESPAÇO DURO** (U+00A0), e é por isso que
 * as frases abaixo o escrevem escapado (`\u00a0`).
 *
 * Escrito com espaço comum, o assert falha exibindo duas strings visualmente
 * IDÊNTICAS — `expected 'Vestido Serena: 3 dia(s) × R$ 500,00 …' to be
 * 'Vestido Serena: 3 dia(s) × R$ 500,00 …'` —, que é o pior vermelho possível:
 * o que não diz o que está errado. É a sobra **S-C30** vista da outra ponta —
 * ela fechou, e a `varredura-espaco-duro-literal` guarda a régua.
 */
const RS = "R$\u00a0";

describe("explicacaoDoAtraso — a tela e a parcela dizem a MESMA frase", () => {
  it("o atraso simples traz a diária, os dias e a multa", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 3 }])!;
    expect(explicacaoDoAtraso(c)).toBe(
      `Vestido Serena: 3 dia(s) × ${RS}500,00 = ${RS}1.500,00; ` +
        `multa de atraso (cláusula 16ª §1º): ${RS}250,00. Total ${RS}1.750,00.`,
    );
  });

  it("o extravio nomeia a cláusula e o múltiplo, e não fala em multa", () => {
    const c = cobrancaDoAtraso([{ ...VESTIDO, dias: 30 }])!;
    expect(explicacaoDoAtraso(c)).toBe(
      `Vestido Serena: 30 dias — extravio (cláusula 16ª), 4× o aluguel = ${RS}12.000,00. ` +
        `Total ${RS}12.000,00.`,
    );
  });
});
