import { describe, expect, it } from "vitest";
import { montarPlanoParcelas, planoDaDigitacao, ratearRestante, temCarne } from "./plano";
import { centavos } from "./dinheiro";

/**
 * E95 — o carnê, provado pela borda da TELA.
 *
 * O rateio já tinha prova de propriedade no servidor (`lote25`), e não era
 * disso que o sistema padecia: a tela nunca chamava aquela função. Ela montava
 * o plano com uma conta própria, em reais float, e 1,77% dos carnês saíam
 * diferentes do que o servidor teria gerado — em silêncio, porque a soma
 * sempre fecha e a guarda `PARCELAS_NAO_BATEM` nunca dispara.
 *
 * Agora é a MESMA função dos dois lados, e a prova vale para o caller da tela.
 */
describe("o plano da tela é o plano do servidor", () => {
  it("R$ 1.282,00 em 10x: dez de R$ 128,20 — a conta antiga dava 128,19 ×9 + 128,29", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: centavos(1282),
      numParcelas: 10,
      primeiroVencimento: "2026-08-10",
    });
    expect(plano.map((p) => p.valorCentavos)).toEqual(Array(10).fill(12820));

    // A conta que a tela fazia, reproduzida aqui para que a diferença fique
    // registrada e não volte por descuido.
    const base = Math.floor((1282 / 10) * 100) / 100;
    expect(base).toBe(128.19);
  });

  /**
   * A prova de PROPRIEDADE (fast-check, milhares de casos) vive no servidor,
   * em `lote25-rateio-parcelas-unit`, e desde o E95 ela roda sobre esta mesma
   * função do core — então ela já cobre o caller da tela. Aqui ficam os casos
   * que doem na venda real: divisão inexata, entrada quebrada, 1 parcela.
   */
  it("a soma é exatamente o total, inclusive quando a divisão não fecha", () => {
    const casos = [
      { total: 948055, entrada: 200000, n: 6 },
      { total: 100000, entrada: 0, n: 3 },
      { total: 100003, entrada: 33333, n: 7 },
      { total: 1, entrada: 0, n: 1 },
      { total: 999999, entrada: 999998, n: 1 },
      { total: 5000000, entrada: 123456, n: 360 },
    ];
    for (const c of casos) {
      const plano = montarPlanoParcelas({
        totalCentavos: c.total,
        entradaCentavos: c.entrada,
        numParcelas: c.n,
        primeiroVencimento: "2026-08-10",
        vencimentoEntrada: "2026-07-27",
      });
      expect(plano.reduce((s, p) => s + p.valorCentavos, 0)).toBe(c.total);
      for (const p of plano) expect(p.valorCentavos).toBeGreaterThanOrEqual(0);
    }
  });

  it("o dia do vencimento se repete todo mês — é o carnê que a loja combina", () => {
    const plano = montarPlanoParcelas({
      totalCentavos: 120000,
      numParcelas: 12,
      primeiroVencimento: "2026-08-05",
    });
    for (const p of plano) expect(p.vencimento.slice(8, 10)).toBe("05");
    expect(plano[11].vencimento).toBe("2027-07-05");
  });

  it("o rateio exportado é o mesmo do servidor", () => {
    expect(ratearRestante(10000, 3)).toEqual([3333, 3333, 3334]);
  });
});

/**
 * S10 — a validação da digitação saiu do `useMemo` da tela de orçamento para
 * as DUAS telas (orçamento e contrato) chamarem a mesma. Ela nunca teve teste
 * próprio enquanto era inline; agora que é a régua de duas prévias, tem.
 */
describe("planoDaDigitacao — a prévia a partir do que está no formulário", () => {
  const base = {
    totalCentavos: 948055,
    entradaDigitada: "2.000,00",
    numParcelasDigitado: "6",
    primeiroVencimento: "2026-08-10",
    vencimentoEntrada: "2026-08-06",
  };

  it("caminho feliz: R$ 9.480,55 com entrada de R$ 2.000,00 em 6x — a mesma conta do servidor", () => {
    const { erro, linhas } = planoDaDigitacao(base);
    expect(erro).toBeNull();
    expect(linhas).toEqual(
      montarPlanoParcelas({
        totalCentavos: 948055,
        entradaCentavos: 200000,
        numParcelas: 6,
        primeiroVencimento: "2026-08-10",
        vencimentoEntrada: "2026-08-06",
      }),
    );
    expect(linhas![0]).toMatchObject({ numero: 0, valorCentavos: 200000, vencimento: "2026-08-06" });
  });

  it("sem a data da 1ª parcela não há erro nem prévia — é formulário pela metade", () => {
    expect(planoDaDigitacao({ ...base, primeiroVencimento: "" })).toEqual({ erro: null, linhas: null });
  });

  it("cada digitação inválida tem a sua frase, e nenhuma estoura", () => {
    expect(planoDaDigitacao({ ...base, totalCentavos: 0 }).erro).toBe(
      "Adicione itens antes de gerar o contrato.",
    );
    expect(planoDaDigitacao({ ...base, entradaDigitada: "abc" }).erro).toBe(
      "Entrada inválida — use apenas números.",
    );
    expect(planoDaDigitacao({ ...base, entradaDigitada: "-10" }).erro).toBe(
      "A entrada não pode ser negativa.",
    );
    expect(planoDaDigitacao({ ...base, entradaDigitada: "10.000,00" }).erro).toBe(
      "A entrada não pode superar o total.",
    );
    expect(planoDaDigitacao({ ...base, numParcelasDigitado: "0" }).erro).toBe(
      "Informe o número de parcelas.",
    );
  });

  it("entrada vazia é zero, e entrada igual ao total dispensa parcelas", () => {
    const semEntrada = planoDaDigitacao({ ...base, entradaDigitada: "" });
    expect(semEntrada.erro).toBeNull();
    expect(semEntrada.linhas!.find((l) => l.numero === 0)).toBeUndefined();

    const aVista = planoDaDigitacao({
      ...base,
      entradaDigitada: "9.480,55",
      numParcelasDigitado: "0",
    });
    expect(aVista.erro).toBeNull();
    expect(aVista.linhas).toHaveLength(1);
    expect(aVista.linhas![0].valorCentavos).toBe(948055);
  });
});

describe("temCarne — a pergunta do servidor, não a heurística pré-S26 (S-M19)", () => {
  it("parcela de AVARIA ou AVULSA não é carnê: o contrato ainda gera o dele", () => {
    // O caso medido pelo achado 5#1 da rodada 2: reparo de R$ 350,00 cobrado
    // antes do carnê num contrato de R$ 5.000,00 — a heurística
    // `parcelas.length > 0` escondia o "Gerar plano" para sempre.
    expect(temCarne([{ origem: "AVARIA" }])).toBe(false);
    expect(temCarne([{ origem: "AVULSA" }, { origem: "AVARIA" }])).toBe(false);
    expect(temCarne([])).toBe(false);
  });

  it("uma parcela de PLANO basta — o carnê existe e não se gera de novo", () => {
    expect(temCarne([{ origem: "AVULSA" }, { origem: "PLANO" }])).toBe(true);
  });
});
