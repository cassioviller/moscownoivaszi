import { describe, it, expect } from "vitest";
import { totalDoPlanoCentavos, planoDivergeDoTotal } from "@/lib/financeiro/plano";

describe("totalDoPlanoCentavos", () => {
  it("soma os valores em centavos", () => {
    expect(totalDoPlanoCentavos(["400.00", "600.00"])).toBe(100000);
    expect(totalDoPlanoCentavos([])).toBe(0);
  });
});

describe("planoDivergeDoTotal", () => {
  it("sem parcelas → false (não há plano para divergir)", () => {
    expect(planoDivergeDoTotal("1000.00", [])).toBe(false);
  });
  it("soma das parcelas bate com o total → false", () => {
    expect(planoDivergeDoTotal("1000.00", ["400.00", "600.00"])).toBe(false);
  });
  it("soma das parcelas difere do total → true", () => {
    expect(planoDivergeDoTotal("1000.00", ["400.00", "500.00"])).toBe(true);
    expect(planoDivergeDoTotal("1300.00", ["200.00", "400.00", "400.00"])).toBe(true);
  });
});
