// src/lib/calendario/__tests__/periodo.test.ts
// Resolver puro do período (abas Vestidos e Provas & ajustes): defaults, validação,
// fim inclusivo (gte/lt) e teto de janela.
import { describe, it, expect } from "vitest";
import { resolverPeriodo, HORIZONTE_PADRAO } from "@/lib/calendario/periodo";

const HOJE = "2026-06-08";

describe("resolverPeriodo", () => {
  it("sem params → hoje até hoje + horizonte padrão", () => {
    const p = resolverPeriodo(undefined, undefined, HOJE);
    expect(p.iniYMD).toBe(HOJE);
    expect(p.fimYMD).toBe("2026-08-07"); // 8 jun + 60 dias
    expect(p.inicio.toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(p.fimExclusivo.toISOString()).toBe("2026-08-08T00:00:00.000Z"); // fim + 1
    expect(p.dias).toBe(HORIZONTE_PADRAO + 1); // inclusivo
  });

  it("respeita um intervalo válido escolhido (fim inclusivo)", () => {
    const p = resolverPeriodo("2026-06-10", "2026-06-20", HOJE);
    expect(p.iniYMD).toBe("2026-06-10");
    expect(p.fimYMD).toBe("2026-06-20");
    expect(p.dias).toBe(11); // 10→20 inclusive
    expect(p.fimExclusivo.toISOString()).toBe("2026-06-21T00:00:00.000Z");
  });

  it("ini inválido cai para hoje; fim inválido cai para ini + horizonte", () => {
    const p = resolverPeriodo("2026-13-40", "lixo", HOJE);
    expect(p.iniYMD).toBe(HOJE);
    expect(p.fimYMD).toBe("2026-08-07");
  });

  it("fim antes de ini é ignorado → ini + horizonte", () => {
    const p = resolverPeriodo("2026-06-10", "2026-06-01", HOJE);
    expect(p.iniYMD).toBe("2026-06-10");
    expect(p.fimYMD).toBe("2026-08-09"); // 10 jun + 60
  });

  it("mesmo dia vira janela de 1 dia (nunca vazia)", () => {
    const p = resolverPeriodo("2026-06-10", "2026-06-10", HOJE);
    expect(p.dias).toBe(1);
    expect(p.fimYMD).toBe("2026-06-10");
    expect(p.fimExclusivo.toISOString()).toBe("2026-06-11T00:00:00.000Z");
  });

  it("limita a janela ao teto de legibilidade (366 dias)", () => {
    const p = resolverPeriodo("2026-01-01", "2030-01-01", HOJE);
    expect(p.dias).toBe(366);
  });
});
