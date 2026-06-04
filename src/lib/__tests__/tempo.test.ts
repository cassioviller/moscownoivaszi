// Convenção de tempo do sistema (puro). hojeYMD/hojeUTC dependem do relógio — testamos
// só a invariante entre eles; meiaNoiteUTC/ymd são puros e testáveis por completo.
import { describe, it, expect } from "vitest";
import { hojeYMD, hojeUTC, meiaNoiteUTC, ymd } from "@/lib/tempo";

describe("meiaNoiteUTC", () => {
  it("'YYYY-MM-DD' → meia-noite UTC daquele dia", () => {
    expect(meiaNoiteUTC("2026-03-15").toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });
  it("borda de mês não desliza", () => {
    expect(meiaNoiteUTC("2026-03-31").toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });
});

describe("ymd", () => {
  it("Date (meia-noite UTC) → 'YYYY-MM-DD'; null permanece null", () => {
    expect(ymd(meiaNoiteUTC("2026-12-01"))).toBe("2026-12-01");
    expect(ymd(null)).toBe(null);
  });
  it("round-trip ymd(meiaNoiteUTC(x)) === x", () => {
    for (const x of ["2026-01-01", "2026-02-28", "2026-07-04", "2026-12-31"]) {
      expect(ymd(meiaNoiteUTC(x))).toBe(x);
    }
  });
});

describe("hojeYMD / hojeUTC", () => {
  it("hojeYMD é 'YYYY-MM-DD' e hojeUTC é a sua meia-noite UTC", () => {
    const d = hojeYMD();
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hojeUTC().toISOString()).toBe(`${d}T00:00:00.000Z`);
  });
});
