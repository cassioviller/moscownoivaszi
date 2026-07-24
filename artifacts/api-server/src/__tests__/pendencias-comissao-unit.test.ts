import { describe, expect, it } from "vitest";
import { competenciasAnteriores, pendenciasDeFechamento } from "../lib/comissao";

/**
 * E53 — a competência esquecida. O diff em si é trivial; o que precisa de
 * prova é a GRANULARIDADE (por vendedora, não por mês) e a janela, porque é
 * nelas que a varredura erraria em silêncio — dando um mês por resolvido.
 */

const JANELA = ["2026-04", "2026-05", "2026-06"];

const venda = (competencia: string, vendedoraId: string, totalC: number) => ({
  competencia,
  vendedoraId,
  totalC,
});

describe("pendenciasDeFechamento", () => {
  it("aponta a competência com venda e sem fechamento", () => {
    const p = pendenciasDeFechamento([venda("2026-05", "v1", 500_000)], [], JANELA);
    expect(p).toEqual([{ competencia: "2026-05", vendedoras: 1, totalC: 500_000 }]);
  });

  it("mês já fechado não é pendência", () => {
    const p = pendenciasDeFechamento(
      [venda("2026-05", "v1", 500_000)],
      [{ competencia: "2026-05", vendedoraId: "v1" }],
      JANELA,
    );
    expect(p).toEqual([]);
  });

  it("mês fechado para UMA vendedora ainda é pendência para a outra", () => {
    // O caso que uma varredura por competência esconderia: o mês fechou para
    // quem já vendia e depois ganhou a venda de outra pessoa. "Esta competência
    // tem algum fechamento?" daria o mês por resolvido.
    const p = pendenciasDeFechamento(
      [venda("2026-05", "v1", 500_000), venda("2026-05", "v2", 300_000)],
      [{ competencia: "2026-05", vendedoraId: "v1" }],
      JANELA,
    );
    expect(p).toEqual([{ competencia: "2026-05", vendedoras: 1, totalC: 300_000 }]);
  });

  it("soma as vendas da mesma vendedora no mês, contando-a uma vez", () => {
    const p = pendenciasDeFechamento(
      [venda("2026-05", "v1", 200_000), venda("2026-05", "v1", 100_000)],
      [],
      JANELA,
    );
    // Duas vendas, uma vendedora: o alerta conta PESSOAS a fechar, não vendas.
    // "2 vendedoras pendentes" numa loja de uma vendedora só é o tipo de
    // número que faz quem lê parar de confiar no alerta inteiro.
    expect(p).toEqual([{ competencia: "2026-05", vendedoras: 1, totalC: 300_000 }]);
  });

  it("mais antiga primeiro — é a esquecida há mais tempo", () => {
    const p = pendenciasDeFechamento(
      [venda("2026-06", "v1", 100), venda("2026-04", "v1", 100), venda("2026-05", "v1", 100)],
      [],
      JANELA,
    );
    expect(p.map((x) => x.competencia)).toEqual(["2026-04", "2026-05", "2026-06"]);
  });

  it("o que está fora da janela não vira alerta", () => {
    // Pendência de dois anos atrás não é esquecimento, é decisão — e continuar
    // gritando sobre ela treinaria o alerta a ser ignorado.
    const p = pendenciasDeFechamento([venda("2023-01", "v1", 900_000)], [], JANELA);
    expect(p).toEqual([]);
  });
});

describe("competenciasAnteriores", () => {
  it("exclui a competência corrente — ela ainda pode receber vendas", () => {
    const janela = competenciasAnteriores("2026-07", 3);
    expect(janela).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(janela).not.toContain("2026-07");
  });

  it("atravessa a virada do ano", () => {
    expect(competenciasAnteriores("2026-02", 4)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });
});
