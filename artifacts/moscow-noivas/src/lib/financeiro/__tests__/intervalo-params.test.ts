import { describe, it, expect } from "vitest";
import { lerFiltroFinanceiro } from "@/lib/financeiro/intervalo-params";

describe("lerFiltroFinanceiro", () => {
  it("resolve intervalo (default mês de hoje) e página", () => {
    const f = lerFiltroFinanceiro({ ini: "2026-06-08", fim: "2026-06-14", p: "2" });
    expect(f.intervalo.iniYMD).toBe("2026-06-08");
    expect(f.intervalo.fimYMD).toBe("2026-06-14");
    expect(f.pagina).toBe(2);
  });
  it("página inválida → 1", () => {
    expect(lerFiltroFinanceiro({ p: "x" }).pagina).toBe(1);
  });
  it("qs preserva ini/fim e mescla extras (sem vazios)", () => {
    const f = lerFiltroFinanceiro({ ini: "2026-06-08", fim: "2026-06-14" });
    const qs = f.qs({ filtro: "abertas", p: 3 });
    const params = new URLSearchParams(qs);
    expect(params.get("ini")).toBe("2026-06-08");
    expect(params.get("fim")).toBe("2026-06-14");
    expect(params.get("filtro")).toBe("abertas");
    expect(params.get("p")).toBe("3");
    expect(lerFiltroFinanceiro({}).qs({ filtro: undefined })).not.toContain("filtro");
  });
});
