// src/lib/calendario/__tests__/periodo.test.ts
// Resolver puro do período da aba Vestidos: defaults, validação e teto de janela.
import { describe, it, expect } from "vitest";
import { resolverPeriodoVestidos, HORIZONTE_PADRAO } from "@/lib/calendario/periodo";

const HOJE = "2026-06-08";

describe("resolverPeriodoVestidos", () => {
  it("sem params → hoje até hoje + horizonte padrão", () => {
    const p = resolverPeriodoVestidos(undefined, undefined, HOJE);
    expect(p.iniYMD).toBe(HOJE);
    expect(p.dias).toBe(HORIZONTE_PADRAO);
    expect(p.fimYMD).toBe("2026-08-07"); // 8 jun + 60 dias
    expect(p.inicio.toISOString()).toBe("2026-06-08T00:00:00.000Z");
  });

  it("respeita um intervalo válido escolhido", () => {
    const p = resolverPeriodoVestidos("2026-06-10", "2026-06-20", HOJE);
    expect(p.iniYMD).toBe("2026-06-10");
    expect(p.fimYMD).toBe("2026-06-20");
    expect(p.dias).toBe(10);
  });

  it("ini inválido cai para hoje; fim inválido cai para ini + horizonte", () => {
    const p = resolverPeriodoVestidos("2026-13-40", "lixo", HOJE);
    expect(p.iniYMD).toBe(HOJE);
    expect(p.dias).toBe(HORIZONTE_PADRAO);
  });

  it("fim antes de ini é ignorado → ini + horizonte", () => {
    const p = resolverPeriodoVestidos("2026-06-10", "2026-06-01", HOJE);
    expect(p.iniYMD).toBe("2026-06-10");
    expect(p.dias).toBe(HORIZONTE_PADRAO);
  });

  it("mesmo dia vira janela de 1 dia (nunca vazia)", () => {
    const p = resolverPeriodoVestidos("2026-06-10", "2026-06-10", HOJE);
    expect(p.dias).toBe(1);
    expect(p.fimYMD).toBe("2026-06-11");
  });

  it("limita a janela ao teto de legibilidade (366 dias)", () => {
    const p = resolverPeriodoVestidos("2026-01-01", "2030-01-01", HOJE);
    expect(p.dias).toBe(366);
  });
});
