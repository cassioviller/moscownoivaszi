import { describe, expect, it } from "vitest";
import { moduloLiberado, podeNoModulo, resumoAcessos } from "./permissoes";

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

describe("resumoAcessos", () => {
  it("rotula os módulos liberados, nunca a chave crua, na ordem canônica", () => {
    expect(resumoAcessos({ financeiro: VER, leads: TUDO })).toBe("Leads, Financeiro");
  });

  it("omite módulo sem nenhuma ação — não conta o objeto como truthy", () => {
    // O bug do D8: `.filter(([, v]) => v)` mostrava um módulo NADA (objeto
    // sempre truthy). Agora ele some.
    expect(resumoAcessos({ financeiro: NADA, leads: VER })).toBe("Leads");
  });

  it("perfil sem nenhum acesso vira 'sem acessos'", () => {
    expect(resumoAcessos({})).toBe("sem acessos");
    expect(resumoAcessos({ financeiro: NADA })).toBe("sem acessos");
  });

  it("tolera o formato plano antigo (true)", () => {
    expect(resumoAcessos({ agenda: true })).toBe("Agenda");
  });

  it("módulo desconhecido cai no fallback, mas não some", () => {
    expect(resumoAcessos({ relatorios: true })).toBe("relatorios");
  });

  it("sem mapa (superadmin) não lista módulos", () => {
    expect(resumoAcessos(null)).toBe("sem acessos");
  });
});
