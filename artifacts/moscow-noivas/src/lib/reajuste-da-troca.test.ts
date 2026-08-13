import { describe, expect, it } from "vitest";
import { reajustePrevisto } from "./reajuste-da-troca";

/**
 * E211 — **o aviso da tela sai da MESMA conta do servidor.**
 *
 * O que se prega aqui não é a aritmética (essa é da régua de
 * `financeiro-core/reajuste.ts`, ao lado): é a escolha de QUAL contrato
 * perguntar, que é onde a tela pode errar sozinha.
 */
describe("reajustePrevisto — o que a troca vai custar, antes do clique", () => {
  const ATIVO = { status: "ATIVO", valorTotal: 5000, reajustesDeData: 0 };

  it("o contrato ATIVO manda, e o cancelado é ignorado", () => {
    const r = reajustePrevisto({
      contratos: [{ status: "CANCELADO", valorTotal: 90_000, reajustesDeData: 0 }, ATIVO],
      deDia: "2027-09-05",
      paraDia: "2028-09-05",
    });
    // Se lesse o cancelado, avisaria R$ 9.000,00 — o valor de um contrato que
    // o servidor não vai reajustar.
    expect(r).toMatchObject({ percentual: 10, valor: 500 });
  });

  it("sem contrato ativo não há o que avisar", () => {
    expect(
      reajustePrevisto({
        contratos: [{ status: "CANCELADO", valorTotal: 5000, reajustesDeData: 0 }],
        deDia: "2027-09-05",
        paraDia: "2028-09-05",
      }),
    ).toBeNull();
  });

  it("dentro do mesmo ano não avisa nada", () => {
    expect(
      reajustePrevisto({ contratos: [ATIVO], deDia: "2027-01-10", paraDia: "2027-12-20" }),
    ).toBeNull();
  });

  it("o degrau vem do contrato: quem já trocou duas vezes vê 30%", () => {
    const r = reajustePrevisto({
      contratos: [{ ...ATIVO, reajustesDeData: 2 }],
      deDia: "2027-09-05",
      paraDia: "2028-09-05",
    });
    expect(r).toMatchObject({ percentual: 30, valor: 1500 });
  });

  it("contrato anterior à coluna começa no primeiro degrau, como a migração decidiu", () => {
    const r = reajustePrevisto({
      contratos: [{ status: "ATIVO", valorTotal: 5000 }],
      deDia: "2027-09-05",
      paraDia: "2028-09-05",
    });
    expect(r).toMatchObject({ percentual: 10 });
  });

  it("sem data dos dois lados, não inventa aviso", () => {
    expect(reajustePrevisto({ contratos: [ATIVO], deDia: null, paraDia: "2028-09-05" })).toBeNull();
    expect(reajustePrevisto({ contratos: [ATIVO], deDia: "2027-09-05", paraDia: undefined })).toBeNull();
  });
});
