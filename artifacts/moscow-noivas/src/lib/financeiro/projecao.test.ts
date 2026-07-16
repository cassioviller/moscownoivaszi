import { describe, expect, it } from "vitest";
import type { Parcela, ContaPagar } from "@workspace/api-client-react";
import { montarCurva, normalizarHorizonte, projetarCaixa } from "./projecao";

const HOJE = "2027-07-16";

/** Data de negócio (meio-dia SP) do dia YYYY-MM-DD. */
const negocio = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toISOString();

function parcela(dia: string, valor: number, status: Parcela["status"] = "PREVISTA"): Parcela {
  return {
    id: `p-${dia}-${valor}`,
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: valor,
    vencimento: negocio(dia),
    status,
  } as Parcela;
}

function conta(dia: string, valor: number, status: ContaPagar["status"] = "PREVISTA"): ContaPagar {
  return {
    id: `c-${dia}-${valor}`,
    lojaId: "loja",
    tipo: "DESPESA",
    descricao: "Conta",
    valorPrevisto: valor,
    vencimento: negocio(dia),
    status,
  } as ContaPagar;
}

describe("montarCurva", () => {
  it("acumula o saldo dia a dia, em ordem", () => {
    const curva = montarCurva(10_000, [
      { dia: "2027-07-20", entradasC: 0, saidasC: 3_000 },
      { dia: "2027-07-18", entradasC: 5_000, saidasC: 0 },
    ]);
    expect(curva.linhas.map((l) => [l.dia, l.saldoApos])).toEqual([
      ["2027-07-18", 150],
      ["2027-07-20", 120],
    ]);
  });

  it("soma eventos do mesmo dia numa linha só", () => {
    const curva = montarCurva(0, [
      { dia: "2027-07-18", entradasC: 5_000, saidasC: 0 },
      { dia: "2027-07-18", entradasC: 1_000, saidasC: 2_000 },
    ]);
    expect(curva.linhas).toEqual([{ dia: "2027-07-18", entradas: 60, saidas: 20, saldoApos: 40 }]);
  });

  it("aponta o primeiro dia negativo e o menor saldo", () => {
    const curva = montarCurva(10_000, [
      { dia: "2027-07-18", entradasC: 0, saidasC: 15_000 }, // saldo -50
      { dia: "2027-07-20", entradasC: 0, saidasC: 10_000 }, // saldo -150 (piso)
      { dia: "2027-07-25", entradasC: 30_000, saidasC: 0 }, // recupera
    ]);
    expect(curva.diaNegativo).toBe("2027-07-18");
    expect(curva.menorSaldo).toEqual({ dia: "2027-07-20", valor: -150 });
  });

  it("sem nada que derrube, o piso é o próprio saldo de partida", () => {
    const curva = montarCurva(5_000, [{ dia: "2027-07-18", entradasC: 1_000, saidasC: 0 }]);
    expect(curva.menorSaldo).toEqual({ dia: null, valor: 50 });
    expect(curva.diaNegativo).toBeNull();
  });

  it("sem eventos devolve curva vazia ancorada no saldo", () => {
    expect(montarCurva(2_500, [])).toEqual({
      linhas: [],
      menorSaldo: { dia: null, valor: 25 },
      diaNegativo: null,
    });
  });
});

describe("normalizarHorizonte", () => {
  it("aceita 30/60/90 e cai em 90 para o resto", () => {
    expect(normalizarHorizonte("30")).toBe(30);
    expect(normalizarHorizonte(60)).toBe(60);
    expect(normalizarHorizonte("90")).toBe(90);
    expect(normalizarHorizonte("45")).toBe(90);
    expect(normalizarHorizonte(null)).toBe(90);
    expect(normalizarHorizonte("abacaxi")).toBe(90);
  });
});

describe("projetarCaixa", () => {
  const opts = { saldoInicial: 1000, horizonteDias: 30 as const, hoje: HOJE };

  it("previsto no horizonte vira curva; vencido vira atraso, fora da curva", () => {
    const p = projetarCaixa(
      [parcela("2027-07-10", 500), parcela("2027-07-20", 800)],
      [conta("2027-07-01", 300), conta("2027-07-25", 200)],
      opts,
    );
    // Só os dois futuros entram na curva.
    expect(p.curva.linhas.map((l) => l.dia)).toEqual(["2027-07-20", "2027-07-25"]);
    expect(p.emAtraso).toEqual({ aReceber: 500, aPagar: 300 });
  });

  it("o que vence hoje entra na curva — não é atraso", () => {
    const p = projetarCaixa([parcela(HOJE, 400)], [], opts);
    expect(p.curva.linhas).toHaveLength(1);
    expect(p.emAtraso.aReceber).toBe(0);
  });

  it("respeita o horizonte: hoje+H entra, hoje+H+1 fica de fora", () => {
    const p = projetarCaixa([parcela("2027-08-15", 100), parcela("2027-08-16", 100)], [], opts);
    expect(p.curva.linhas.map((l) => l.dia)).toEqual(["2027-08-15"]); // 16/07 + 30 = 15/08
  });

  it("ignora obrigações já liquidadas", () => {
    const p = projetarCaixa(
      [parcela("2027-07-20", 500, "PAGA"), parcela("2027-07-21", 100, "CANCELADA")],
      [conta("2027-07-22", 300, "PAGA")],
      opts,
    );
    expect(p.curva.linhas).toEqual([]);
  });

  it("parte do saldo informado", () => {
    const p = projetarCaixa([], [conta("2027-07-20", 400)], opts);
    expect(p.curva.linhas[0].saldoApos).toBe(600);
  });
});
