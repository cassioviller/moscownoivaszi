import { describe, expect, it } from "vitest";
import { moduloLiberado, podeNoModulo } from "./permissoes";

const VER = { ver: true, criar: false, editar: false };
const TUDO = { ver: true, criar: true, editar: true };
const NADA = { ver: false, criar: false, editar: false };

describe("podeNoModulo", () => {
  it("responde por ação", () => {
    const a = { financeiro: VER };
    expect(podeNoModulo(a, "financeiro", "ver")).toBe(true);
    expect(podeNoModulo(a, "financeiro", "criar")).toBe(false);
    expect(podeNoModulo(a, "financeiro", "editar")).toBe(false);
  });

  it("quem cria ou edita, vê — mesma coerência do servidor", () => {
    expect(podeNoModulo({ leads: { criar: true } }, "leads", "ver")).toBe(true);
    expect(podeNoModulo({ leads: { editar: true } }, "leads", "ver")).toBe(true);
  });

  it("ver não concede escrita", () => {
    expect(podeNoModulo({ leads: VER }, "leads", "criar")).toBe(false);
  });

  it("sem mapa é superadmin: sem restrição, não sem acesso", () => {
    expect(podeNoModulo(null, "financeiro", "editar")).toBe(true);
    expect(podeNoModulo(undefined, "financeiro", "editar")).toBe(true);
  });

  it("módulo ausente nega — mas é sinal de gate apontando para o lugar errado", () => {
    // Era o caso de `config`: o servidor não conhece esse módulo, devolve
    // undefined, e o gate fechava para todo mundo em silêncio.
    expect(podeNoModulo({ agenda: TUDO }, "config", "editar")).toBe(false);
  });

  it("nega o que não foi concedido", () => {
    expect(podeNoModulo({ financeiro: NADA }, "financeiro", "ver")).toBe(false);
    expect(podeNoModulo({}, "leads", "ver")).toBe(false);
  });

  it("tolera o formato plano antigo — sessão aberta antes da mudança não trava", () => {
    expect(podeNoModulo({ leads: true }, "leads", "editar")).toBe(true);
    expect(podeNoModulo({ leads: false }, "leads", "ver")).toBe(false);
  });

  it("valor que não é literalmente true não concede", () => {
    expect(podeNoModulo({ leads: { criar: "on" } }, "leads", "criar")).toBe(false);
  });
});

describe("moduloLiberado", () => {
  it("libera com qualquer ação concedida", () => {
    expect(moduloLiberado(VER)).toBe(true);
    expect(moduloLiberado(TUDO)).toBe(true);
    expect(moduloLiberado(true)).toBe(true);
  });

  it("nega sem nenhuma", () => {
    expect(moduloLiberado(NADA)).toBe(false);
    expect(moduloLiberado(false)).toBe(false);
    expect(moduloLiberado(undefined)).toBe(false);
  });
});
