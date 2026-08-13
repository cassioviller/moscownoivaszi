import { describe, expect, it } from "vitest";
import {
  DIAS_DO_MES_DE_MORA,
  JUROS_DE_MORA_MENSAL_PCT,
  MULTA_DE_MORA_PCT,
  diasDeMora,
  explicacaoDaMora,
  moraDaParcela,
} from "@workspace/financeiro-core";

/**
 * **E213 — a parcela vencida tem multa e juros** (cláusula 9ª).
 *
 * O sistema já sabia que a parcela estava atrasada desde o E49 — `estaAtrasada`
 * é derivada e `projecao.emAtraso` totaliza o saldo vencido. **O número existia
 * e a multa não.**
 *
 * **Mora aqui, e não ao lado do módulo**, pela mesma razão dos irmãos
 * `reajuste.test.ts`, `avaria.test.ts` e `atraso.test.ts`: nenhum `vitest.config`
 * alcança `lib/**`, e um teste escrito lá responde "No test files found" como se
 * estivesse tudo bem.
 *
 * A base é a **parcela vencida**, não o contrato (decisão da dona em
 * 13/08/2026, sustentada pelo CDC art. 52 §1º). Os exemplos usam o carnê de
 * referência da trilha: contrato de R$ 5.000,00 em 10 × R$ 500,00.
 */

const HOJE = "2026-08-13";

describe("diasDeMora — vencer HOJE não é estar vencida", () => {
  it("o dia do vencimento é zero — é o último dia de pagar em dia", () => {
    expect(diasDeMora("2026-08-13", HOJE)).toBe(0);
  });

  it("vencimento futuro também é zero, nunca negativo", () => {
    expect(diasDeMora("2026-09-01", HOJE)).toBe(0);
  });

  it("cada dia depois conta um", () => {
    expect(diasDeMora("2026-08-12", HOJE)).toBe(1);
    expect(diasDeMora("2026-07-14", HOJE)).toBe(30);
  });

  it("atravessa a virada do ano sem contar errado", () => {
    expect(diasDeMora("2025-12-30", "2026-01-03")).toBe(4);
  });
});

describe("moraDaParcela — a conta da 9ª", () => {
  it("parcela em dia não deve nada, e `null` não é erro", () => {
    expect(moraDaParcela({ saldoAberto: 500, vencimento: "2026-09-01", hoje: HOJE })).toBeNull();
    expect(moraDaParcela({ saldoAberto: 500, vencimento: HOJE, hoje: HOJE })).toBeNull();
  });

  it("parcela sem saldo aberto não deve nada, por mais antiga que seja", () => {
    expect(moraDaParcela({ saldoAberto: 0, vencimento: "2025-01-01", hoje: HOJE })).toBeNull();
  });

  /**
   * O exemplo da decisão: R$ 500,00 vencidos há 30 dias.
   * Multa 2% = R$ 10,00 · juros 1% × 30/30 = R$ 5,00 · total R$ 515,00.
   */
  it("R$ 500,00 vencidos há 30 dias: R$ 10,00 de multa e R$ 5,00 de juros", () => {
    const m = moraDaParcela({ saldoAberto: 500, vencimento: "2026-07-14", hoje: HOJE })!;
    expect(m.dias).toBe(30);
    expect(m.multa).toBe(10);
    expect(m.juros).toBe(5);
    expect(m.acrescimo).toBe(15);
    expect(m.total).toBe(515);
  });

  /**
   * **A multa entra UMA vez e os juros correm.** É o que separa as duas: quem
   * atrasa 1 dia e quem atrasa 60 pagam a MESMA multa, e juros diferentes.
   */
  it("a multa não cresce com o tempo — só os juros correm", () => {
    const umDia = moraDaParcela({ saldoAberto: 500, vencimento: "2026-08-12", hoje: HOJE })!;
    const sessenta = moraDaParcela({ saldoAberto: 500, vencimento: "2026-06-14", hoje: HOJE })!;
    expect(umDia.multa).toBe(sessenta.multa);
    expect(umDia.multa).toBe(10);
    // 1% × 60/30 = 2% de R$ 500,00.
    expect(sessenta.juros).toBe(10);
    expect(sessenta.dias).toBe(60);
  });

  it("os juros são *pro rata die* — meio mês é metade", () => {
    const m = moraDaParcela({ saldoAberto: 500, vencimento: "2026-07-29", hoje: HOJE })!;
    expect(m.dias).toBe(15);
    // 1% × 15/30 = 0,5% de R$ 500,00.
    expect(m.juros).toBe(2.5);
  });

  /**
   * **A prova de que a base é a PARCELA, e não o contrato.** Com a leitura
   * literal da cláusula, esta mesma parcela levaria 2% de R$ 5.000,00 =
   * R$ 100,00 de multa — dez vezes mais, e de novo a cada parcela atrasada.
   * Este assert é o que quebra se alguém trocar a base sem ler o CDC.
   */
  it("a multa é 2% da PARCELA — R$ 10,00, e não os R$ 100,00 do contrato", () => {
    const m = moraDaParcela({ saldoAberto: 500, vencimento: "2026-08-12", hoje: HOJE })!;
    expect(m.multa).toBe(500 * (MULTA_DE_MORA_PCT / 100));
    expect(m.multa).toBe(10);
    expect(m.multa).not.toBe(5000 * (MULTA_DE_MORA_PCT / 100));
  });

  it("a conta incide sobre o SALDO em aberto, não sobre o previsto", () => {
    // Parcela de R$ 500,00 com R$ 300,00 já recebidos: a mora é sobre os R$ 200,00.
    const m = moraDaParcela({ saldoAberto: 200, vencimento: "2026-07-14", hoje: HOJE })!;
    expect(m.saldo).toBe(200);
    expect(m.multa).toBe(4);
    expect(m.juros).toBe(2);
    expect(m.total).toBe(206);
  });

  it("arredonda em centavos, e uma vez só", () => {
    // R$ 333,33 × 2% = R$ 6,6666 → R$ 6,67. Juros 1% × 7/30 = R$ 0,7777 → R$ 0,78.
    const m = moraDaParcela({ saldoAberto: 333.33, vencimento: "2026-08-06", hoje: HOJE })!;
    expect(m.dias).toBe(7);
    expect(m.multa).toBe(6.67);
    expect(m.juros).toBe(0.78);
    expect(m.acrescimo).toBe(7.45);
    expect(m.total).toBe(340.78);
  });

  /**
   * **A perdoada devolve objeto, não `null`.** Devolver `null` faria o perdão
   * ficar invisível: a tela mostraria a parcela vencida sem acréscimo e sem
   * dizer por quê, e a próxima leitura estranharia o número.
   */
  it("perdoada: o acréscimo zera e a conta continua VISÍVEL", () => {
    const m = moraDaParcela({
      saldoAberto: 500,
      vencimento: "2026-07-14",
      hoje: HOJE,
      perdoada: true,
    })!;
    expect(m).not.toBeNull();
    expect(m.perdoada).toBe(true);
    expect(m.dias).toBe(30);
    expect(m.multa).toBe(0);
    expect(m.juros).toBe(0);
    expect(m.acrescimo).toBe(0);
    expect(m.total).toBe(500);
  });

  it("aceita o vencimento como INSTANTE e o lê como dia de negócio", () => {
    const comoInstante = moraDaParcela({
      saldoAberto: 500,
      vencimento: new Date("2026-07-14T12:00:00-03:00"),
      hoje: HOJE,
    })!;
    expect(comoInstante.dias).toBe(30);
  });
});

/**
 * O `brl` separa "R$" do número com espaço duro (U+00A0) — a sobra S-C30. As
 * frases abaixo o escrevem escapado, senão o assert falha exibindo duas strings
 * visualmente idênticas.
 */
const RS = "R$\u00a0";

describe("explicacaoDaMora — a frase diz o que a conta TEM e o que ela não tem", () => {
  it("decompõe multa e juros, e declara a ausência da correção monetária", () => {
    const m = moraDaParcela({ saldoAberto: 500, vencimento: "2026-07-14", hoje: HOJE })!;
    expect(explicacaoDaMora(m)).toBe(
      `Vencida há 30 dia(s): multa de ${MULTA_DE_MORA_PCT}% = ${RS}10,00 · ` +
        `juros de ${JUROS_DE_MORA_MENSAL_PCT}% ao mês (30/${DIAS_DO_MES_DE_MORA}) = ${RS}5,00. ` +
        `Saldo ${RS}500,00 + ${RS}15,00 = ${RS}515,00. ` +
        "Sem correção monetária — o contrato não nomeia índice.",
    );
  });

  it("a perdoada diz que foi perdoada, e não some da tela", () => {
    const m = moraDaParcela({
      saldoAberto: 500,
      vencimento: "2026-07-14",
      hoje: HOJE,
      perdoada: true,
    })!;
    expect(explicacaoDaMora(m)).toBe(
      `Vencida há 30 dia(s) — multa e juros PERDOADOS (cláusula 9ª). Saldo ${RS}500,00.`,
    );
  });
});
