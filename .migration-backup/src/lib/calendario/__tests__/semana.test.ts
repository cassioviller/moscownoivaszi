import { describe, it, expect } from "vitest";
import {
  inicioDaSemana,
  diasDaSemana,
  semanaDeRef,
  chaveCelula,
  indexarPorCelula,
  refDaSemana,
} from "@/lib/calendario/semana";

describe("inicioDaSemana / diasDaSemana", () => {
  it("recua até o domingo da semana", () => {
    const ini = inicioDaSemana(new Date("2026-06-03T15:00:00.000Z")); // quarta
    expect(ini.toISOString().slice(0, 10)).toBe("2026-05-31"); // domingo
    expect(ini.getUTCHours()).toBe(0);
  });
  it("gera 7 dias consecutivos a partir do domingo", () => {
    const dias = diasDaSemana(new Date("2026-06-03T00:00:00.000Z"));
    expect(dias).toHaveLength(7);
    expect(dias[0].getUTCDay()).toBe(0);
    expect(dias.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-05-31", "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06",
    ]);
  });
});

describe("semanaDeRef / refDaSemana", () => {
  it("ref 'YYYY-MM-DD' válida → domingo daquela semana", () => {
    expect(semanaDeRef("2026-06-03", "2026-01-01").toISOString().slice(0, 10)).toBe("2026-05-31");
  });
  it("ref ausente/inválida → semana de hoje", () => {
    expect(semanaDeRef(undefined, "2026-06-03").toISOString().slice(0, 10)).toBe("2026-05-31");
    expect(semanaDeRef("lixo", "2026-06-03").toISOString().slice(0, 10)).toBe("2026-05-31");
  });
  it("refDaSemana devolve o YMD do dia dado", () => {
    expect(refDaSemana(new Date("2026-06-07T00:00:00.000Z"))).toBe("2026-06-07");
  });
});

describe("indexarPorCelula", () => {
  it("agrupa por dia×hora (UTC)", () => {
    const itens = [
      { id: "a", inicio: new Date("2026-06-03T10:00:00.000Z") },
      { id: "b", inicio: new Date("2026-06-03T10:00:00.000Z") },
      { id: "c", inicio: new Date("2026-06-04T14:00:00.000Z") },
    ];
    const idx = indexarPorCelula(itens);
    expect(idx.get(chaveCelula("2026-06-03", 10))!.map((x) => x.id)).toEqual(["a", "b"]);
    expect(idx.get(chaveCelula("2026-06-04", 14))!.map((x) => x.id)).toEqual(["c"]);
    expect(idx.has(chaveCelula("2026-06-03", 9))).toBe(false);
  });
});
