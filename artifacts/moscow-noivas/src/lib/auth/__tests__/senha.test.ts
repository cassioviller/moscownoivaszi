import { describe, it, expect } from "vitest";
import { gerarHash, verificarSenha } from "@/lib/auth/senha";

describe("senha — verificar e gerar hash", () => {
  it("gerarHash devolve um hash bcrypt válido (60 chars começando com $2)", async () => {
    const hash = await gerarHash("admin123");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash.length).toBeGreaterThanOrEqual(59);
  });

  it("verificarSenha retorna true para senha correta", async () => {
    const hash = await gerarHash("admin123");
    expect(await verificarSenha("admin123", hash)).toBe(true);
  });

  it("verificarSenha retorna false para senha incorreta", async () => {
    const hash = await gerarHash("admin123");
    expect(await verificarSenha("errada", hash)).toBe(false);
  });

  it("verificarSenha retorna false para hash inválido (sem lançar)", async () => {
    expect(await verificarSenha("admin123", "isto-nao-e-um-hash")).toBe(false);
  });

  it("verificarSenha retorna false para senha vazia", async () => {
    const hash = await gerarHash("admin123");
    expect(await verificarSenha("", hash)).toBe(false);
  });
});
