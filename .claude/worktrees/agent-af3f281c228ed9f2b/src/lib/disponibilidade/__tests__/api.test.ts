import { describe, it, expect } from "vitest";
import { vestidoDisponivel, type Regras } from "@/lib/disponibilidade";

const REGRAS: Regras = {
  provaDiasAntes: 14, provaDuracao: 2, usoDiasAntes: 3, usoDiasDepois: 2, lavagemDiasDepois: 7,
};

describe("superfície pública do motor", () => {
  it("expõe vestidoDisponivel pelo barrel (@/lib/disponibilidade)", () => {
    const r = vestidoDisponivel({
      vestidoId: "v1",
      casamentoDataCandidata: "2026-06-20",
      regras: REGRAS,
      bloqueiosExistentes: [],
    });
    expect(r.disponivel).toBe(true);
  });
});
