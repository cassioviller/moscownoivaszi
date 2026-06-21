import { describe, it, expect } from "vitest";
import {
  gradeDoMes,
  mesDeRef,
  refDoMes,
  mesVizinho,
  agruparMarcadoresPorDia,
} from "@/lib/calendario/mes";

describe("gradeDoMes", () => {
  it("retorna 42 dias começando num domingo", () => {
    const dias = gradeDoMes(2026, 5, "2026-06-05"); // junho/2026
    expect(dias).toHaveLength(42);
    expect(dias[0].data.getUTCDay()).toBe(0); // domingo
  });
  it("marca o primeiro e o último dia do mês de referência", () => {
    const dias = gradeDoMes(2026, 5, "2026-06-05");
    const doMes = dias.filter((d) => d.noMes);
    expect(doMes[0].ymd).toBe("2026-06-01");
    expect(doMes[doMes.length - 1].ymd).toBe("2026-06-30");
  });
  it("sinaliza o dia de hoje", () => {
    const dias = gradeDoMes(2026, 5, "2026-06-05");
    expect(dias.filter((d) => d.hoje).map((d) => d.ymd)).toEqual(["2026-06-05"]);
  });
});

describe("mesDeRef / refDoMes / mesVizinho", () => {
  it("parseia 'YYYY-MM' válido", () => {
    expect(mesDeRef("2026-03", "2026-06-05")).toEqual({ ano: 2026, mes0: 2 });
  });
  it("ref ausente/inválida → mês de hoje", () => {
    expect(mesDeRef(undefined, "2026-06-05")).toEqual({ ano: 2026, mes0: 5 });
    expect(mesDeRef("2026-13", "2026-06-05")).toEqual({ ano: 2026, mes0: 5 });
    expect(mesDeRef("lixo", "2026-06-05")).toEqual({ ano: 2026, mes0: 5 });
  });
  it("refDoMes formata com mês 1-based e zero-pad", () => {
    expect(refDoMes(2026, 0)).toBe("2026-01");
    expect(refDoMes(2026, 11)).toBe("2026-12");
  });
  it("mesVizinho vira o ano nas bordas", () => {
    expect(mesVizinho(2026, 0, -1)).toEqual({ ano: 2025, mes0: 11 });
    expect(mesVizinho(2026, 11, +1)).toEqual({ ano: 2027, mes0: 0 });
  });
});

describe("agruparMarcadoresPorDia", () => {
  it("agrupa por ymd e deduplica tipos repetidos no mesmo dia", () => {
    const m = agruparMarcadoresPorDia([
      { ymd: "2026-06-02", tipo: "prova" },
      { ymd: "2026-06-02", tipo: "prova" },
      { ymd: "2026-06-02", tipo: "casamento" },
      { ymd: "2026-06-10", tipo: "atendimento" },
    ]);
    expect([...(m.get("2026-06-02") ?? [])].sort()).toEqual(["casamento", "prova"]);
    expect([...(m.get("2026-06-10") ?? [])]).toEqual(["atendimento"]);
    expect(m.has("2026-06-03")).toBe(false);
  });
});
