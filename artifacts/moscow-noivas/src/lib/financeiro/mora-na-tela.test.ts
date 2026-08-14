import { describe, expect, it } from "vitest";
import type { Parcela } from "@workspace/api-client-react";
import {
  moraEmAberto,
  podePerdoarMora,
  sugestaoDeRecebimento,
  valorDaParcelaNaTela,
} from "./mora-na-tela";

/**
 * **E226 — qual número a tela mostra, e qual ela sugere.**
 *
 * A conta da cláusula 9ª é do `financeiro-core` e está pregada em `mora.test.ts`
 * desde o E213. **Este arquivo prega a outra metade, que não existia: o que a
 * VENDEDORA lê.**
 *
 * O defeito medido: o carnê do contrato imprimia `parcela.valorPrevisto`
 * (`contratos/[id].tsx:748`) e o diálogo de receber pré-preenchia
 * `saldoAberto(parcela)` (`dialogo-receber-parcela.tsx:103`). Numa parcela de
 * R$ 500,00 vencida há 30 dias, o portal da noiva dizia **R$ 515,00**, a porta
 * ACEITAVA R$ 515,00, e a tela da vendedora oferecia **R$ 500,00** — os R$ 15,00
 * da cláusula ficavam no chão a cada lançamento, e ela tem `financeiro: NADA`,
 * então este é o único lugar onde ela vê dinheiro.
 *
 * **A régua é de EFEITO e não de letra** — a lição da S-C130 no lote das quatro
 * amarelas: um assert que pregasse `valorPrevisto` passaria nos dois lados do
 * conserto. Aqui cada caso nomeia o número que a pessoa lê.
 */

/** Uma parcela de R$ 500,00, com a mora que a porta anexa (ou sem). */
function parcela(over: Partial<Parcela> = {}): Parcela {
  return {
    id: "p1",
    lojaId: "l1",
    contratoId: "c1",
    numero: 1,
    descricao: "Parcela 1",
    origem: "PLANO",
    status: "PREVISTA",
    valorPrevisto: 500,
    valorRecebido: null,
    vencimento: "2026-07-14",
    mora: null,
    moraPerdoadaEm: null,
    moraPerdoadaMotivo: null,
    ...over,
  } as Parcela;
}

/** A mora de R$ 500,00 vencidos há 30 dias: 2% + 1%/mês = R$ 15,00. */
const MORA_30_DIAS = {
  dias: 30,
  saldo: 500,
  multa: 10,
  juros: 5,
  acrescimo: 15,
  total: 515,
  perdoada: false,
  explicacao: "Vencida há 30 dias: multa de 2% (R$ 10,00) e juros de 1% ao mês (R$ 5,00).",
};

describe("valorDaParcelaNaTela — o número em negrito na linha", () => {
  it("a parcela em dia mostra o previsto", () => {
    expect(valorDaParcelaNaTela(parcela())).toBe(500);
  });

  it("vencida há 30 dias mostra R$ 515,00 — o que a noiva já lia no portal", () => {
    expect(valorDaParcelaNaTela(parcela({ mora: MORA_30_DIAS }))).toBe(515);
  });

  it("perdoada volta aos R$ 500,00 — o perdão é o gesto, e ele aparece no número", () => {
    expect(
      valorDaParcelaNaTela(
        parcela({ mora: { ...MORA_30_DIAS, total: 500, acrescimo: 0, perdoada: true } }),
      ),
    ).toBe(500);
  });

  it("a PARCIAL mostra o total devido do SALDO, não o previsto cheio", () => {
    // R$ 500,00 com R$ 300,00 pagos: a mora incide sobre R$ 200,00 → R$ 206,00.
    const p = parcela({
      status: "PARCIAL",
      valorRecebido: 300,
      mora: { ...MORA_30_DIAS, saldo: 200, multa: 4, juros: 2, acrescimo: 6, total: 206 },
    });
    expect(valorDaParcelaNaTela(p)).toBe(206);
  });

  it("a CANCELADA mostra o previsto e nada mais — ela não deve mora", () => {
    expect(valorDaParcelaNaTela(parcela({ status: "CANCELADA" }))).toBe(500);
  });

  it("`mora` ausente é tratada como parcela em dia — a porta velha não derruba a tela", () => {
    // Enquanto o `GET /contratos/:id` não anexava a conta, o campo chegava
    // `undefined`. Uma tela que somasse `mora.total` cru quebraria; esta cai no
    // previsto, que é o que ela já mostrava.
    const semCampo = { ...parcela() } as Parcela;
    delete (semCampo as unknown as Record<string, unknown>).mora;
    expect(valorDaParcelaNaTela(semCampo)).toBe(500);
  });
});

describe("sugestaoDeRecebimento — o valor que o diálogo abre preenchido", () => {
  it("vencida sugere R$ 515,00, que é o que a porta aceita", () => {
    expect(sugestaoDeRecebimento(parcela({ mora: MORA_30_DIAS }))).toBe(515);
  });

  it("em dia sugere o saldo, como sempre", () => {
    expect(sugestaoDeRecebimento(parcela())).toBe(500);
  });

  it("a PARCIAL sugere o saldo COM a mora, nunca o previsto cheio", () => {
    const p = parcela({
      status: "PARCIAL",
      valorRecebido: 300,
      mora: { ...MORA_30_DIAS, saldo: 200, multa: 4, juros: 2, acrescimo: 6, total: 206 },
    });
    // O erro que a noiva percebe primeiro é ser cobrada de novo pelo que pagou.
    expect(sugestaoDeRecebimento(p)).toBe(206);
  });

  it("perdoada sugere o principal — o perdão é para valer no lançamento", () => {
    const p = parcela({ mora: { ...MORA_30_DIAS, total: 500, acrescimo: 0, perdoada: true } });
    expect(sugestaoDeRecebimento(p)).toBe(500);
  });
});

describe("moraEmAberto — quando a linha explica o acréscimo", () => {
  it("vencida e não perdoada, a explicação é dita", () => {
    expect(moraEmAberto(parcela({ mora: MORA_30_DIAS }))?.acrescimo).toBe(15);
  });

  it("em dia não há o que explicar", () => {
    expect(moraEmAberto(parcela())).toBeNull();
  });

  it("perdoada não é 'em aberto' — o selo é outro, e ele diz o motivo", () => {
    const p = parcela({
      mora: { ...MORA_30_DIAS, total: 500, acrescimo: 0, perdoada: true },
      moraPerdoadaEm: "2026-08-14",
      moraPerdoadaMotivo: "A noiva avisou da internação do pai",
    });
    expect(moraEmAberto(p)).toBeNull();
  });
});

describe("podePerdoarMora — o gesto só existe onde há o que perdoar", () => {
  it("vencida e não perdoada: sim", () => {
    expect(podePerdoarMora(parcela({ mora: MORA_30_DIAS }))).toBe(true);
  });

  it("em dia: não — perdoar o que não é devido gravaria um selo permanente de uma dívida que nunca existiu", () => {
    expect(podePerdoarMora(parcela())).toBe(false);
  });

  it("já perdoada: não — o gesto de lá é RESTABELECER, e o segundo clique se autoconfirmaria", () => {
    const p = parcela({
      mora: { ...MORA_30_DIAS, total: 500, acrescimo: 0, perdoada: true },
      moraPerdoadaEm: "2026-08-14",
    });
    expect(podePerdoarMora(p)).toBe(false);
  });

  it("cancelada: não", () => {
    expect(podePerdoarMora(parcela({ status: "CANCELADA", mora: MORA_30_DIAS }))).toBe(false);
  });
});
