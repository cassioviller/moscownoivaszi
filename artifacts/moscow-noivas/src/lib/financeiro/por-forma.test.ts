import { describe, expect, it } from "vitest";
import type { Parcela } from "@workspace/api-client-react";
import { recebimentosPorForma } from "./forma";
import { resumoCaixa } from "./fluxo";
import { dreDoIntervalo } from "./dre";
import { linhasDre } from "./exportar";

/**
 * E50 — recebimentos por meio. A invariante que sustenta a conciliação é uma
 * só: o breakdown TEM de somar o mesmo que o total de recebimentos do fluxo e
 * do DRE. Se divergir, alguém está lendo o caixa errado — e o número que a
 * contadora bate contra o extrato passa a ser o errado.
 */

const INTERVALO = { iniYMD: "2027-03-01", fimYMD: "2027-03-31" };

function recebida(over: Partial<Parcela> = {}): Parcela {
  return {
    id: "p1",
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: 1000,
    vencimento: new Date("2027-03-10T12:00:00-03:00").toISOString(),
    status: "PAGA",
    valorRecebido: 1000,
    recebidoEm: new Date("2027-03-10T14:00:00-03:00").toISOString(),
    formaRecebimento: "PIX",
    ...over,
  } as Parcela;
}

describe("recebimentosPorForma", () => {
  it("agrupa por meio, somando valor e contagem", () => {
    const r = recebimentosPorForma(
      [
        recebida({ id: "a", valorRecebido: 300, formaRecebimento: "PIX" }),
        recebida({ id: "b", valorRecebido: 200, formaRecebimento: "PIX" }),
        recebida({ id: "c", valorRecebido: 800, formaRecebimento: "CARTAO_CREDITO" }),
      ],
      INTERVALO,
    );

    // Maior primeiro: a pergunta é "o que pesa mais".
    expect(r.linhas.map((l) => [l.rotulo, l.total, l.qtd])).toEqual([
      ["Cartão de crédito", 800, 1],
      ["Pix", 500, 2],
    ]);
    expect(r.total).toBe(1300);
  });

  it("o total do breakdown é o MESMO do fluxo e do DRE", () => {
    const parcelas = [
      recebida({ id: "a", valorRecebido: 300, formaRecebimento: "DINHEIRO" }),
      recebida({ id: "b", valorRecebido: 250.55, formaRecebimento: "BOLETO" }),
      recebida({ id: "c", valorRecebido: 99.45, formaRecebimento: null }),
    ];

    const porForma = recebimentosPorForma(parcelas, INTERVALO);
    // Centavos fechando: somar em float daria 649.9999999999999.
    expect(porForma.total).toBe(650);
    expect(resumoCaixa(parcelas, [], INTERVALO).entradas).toBe(porForma.total);
    expect(dreDoIntervalo(parcelas, [], INTERVALO).receitas).toBe(porForma.total);
  });

  it("sem forma registrada vira 'Não informado', e sempre por último", () => {
    const r = recebimentosPorForma(
      [
        recebida({ id: "a", valorRecebido: 5000, formaRecebimento: null }),
        recebida({ id: "b", valorRecebido: 10, formaRecebimento: "PIX" }),
      ],
      INTERVALO,
    );
    // Mesmo sendo o maior valor: é lacuna de cadastro, não um meio de pagamento.
    expect(r.linhas.map((l) => l.rotulo)).toEqual(["Pix", "Não informado"]);
  });

  it("a parcela PARCIAL entra pelo que ENTROU, não pelo previsto", () => {
    // E49: meio pagamento é dinheiro no caixa, e conciliar é sobre o caixa.
    const r = recebimentosPorForma(
      [recebida({ status: "PARCIAL", valorPrevisto: 1000, valorRecebido: 400 })],
      INTERVALO,
    );
    expect(r.total).toBe(400);
  });

  it("o que não entrou no intervalo fica de fora", () => {
    const r = recebimentosPorForma(
      [
        recebida({ id: "fora", recebidoEm: new Date("2027-02-28T14:00:00-03:00").toISOString() }),
        recebida({ id: "aberta", status: "PREVISTA", valorRecebido: null, recebidoEm: null }),
      ],
      INTERVALO,
    );
    expect(r.linhas).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("o CSV do DRE leva o recorte por meio", () => {
  it("as linhas por meio somam o mesmo que a linha de Recebimentos", () => {
    const parcelas = [
      recebida({ id: "a", valorRecebido: 300, formaRecebimento: "PIX" }),
      recebida({ id: "b", valorRecebido: 700, formaRecebimento: "CARTAO_DEBITO" }),
    ];
    const dre = dreDoIntervalo(parcelas, [], INTERVALO);
    const linhas = linhasDre(dre, "2027-03", recebimentosPorForma(parcelas, INTERVALO));

    const recebimentos = linhas.find((l) => l[1] === "Recebimentos")!;
    const porMeio = linhas.filter((l) => l[1].startsWith("Recebimento — "));
    expect(porMeio.map((l) => l[1])).toEqual([
      "Recebimento — Cartão de débito",
      "Recebimento — Pix",
    ]);
    const soma = porMeio.reduce((s, l) => s + Number(l[2]), 0);
    expect(soma.toFixed(2)).toBe(recebimentos[2]);
  });

  it("sem o recorte, o CSV segue igual ao de antes", () => {
    // O parâmetro é opcional: quem não passa não ganha linhas a mais.
    const dre = dreDoIntervalo([recebida()], [], INTERVALO);
    expect(linhasDre(dre, "2027-03").some((l) => l[1].startsWith("Recebimento — "))).toBe(false);
  });
});
