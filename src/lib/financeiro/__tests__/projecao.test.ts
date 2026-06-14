// Unit (puro): montarCurva aplica eventos por dia sobre um saldo de partida (centavos).
import { describe, it, expect } from "vitest";
import { montarCurva, type EventoDia } from "@/lib/financeiro/projecao";

const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ev = (ymd: string, entradasC: number, saidasC: number): EventoDia => ({ ymd, data: d(ymd), entradasC, saidasC });

describe("montarCurva", () => {
  it("sem eventos: curva vazia, sem dia negativo, menor saldo = saldo de hoje", () => {
    const c = montarCurva(800000, []);
    expect(c.linhas).toEqual([]);
    expect(c.diaNegativo).toBeNull();
    expect(c.menorSaldo).toEqual({ data: null, valor: "8000.00" });
  });

  it("fica negativo num dia → diaNegativo é aquele dia", () => {
    const c = montarCurva(100000, [ev("2026-06-20", 0, 250000)]);
    expect(c.linhas[0].saldoApos).toBe("-1500.00");
    expect(c.diaNegativo).toEqual(d("2026-06-20"));
  });

  it("afunda e recupera depois → menor saldo é no fundo, não no fim", () => {
    const c = montarCurva(500000, [ev("2026-06-15", 0, 400000), ev("2026-06-25", 600000, 0)]);
    expect(c.linhas.at(-1)!.saldoApos).toBe("7000.00");
    expect(c.menorSaldo).toEqual({ data: d("2026-06-15"), valor: "1000.00" });
  });

  it("borda exatamente zero não conta como negativa", () => {
    const c = montarCurva(300000, [ev("2026-06-18", 0, 300000)]);
    expect(c.linhas[0].saldoApos).toBe("0.00");
    expect(c.diaNegativo).toBeNull();
  });

  it("dois eventos no mesmo dia somam numa linha só", () => {
    const c = montarCurva(0, [ev("2026-06-12", 150000, 0), ev("2026-06-12", 0, 50000)]);
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0]).toMatchObject({ entradas: "1500.00", saidas: "500.00", saldoApos: "1000.00" });
  });
});
