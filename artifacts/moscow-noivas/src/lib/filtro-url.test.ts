import { describe, expect, it } from "vitest";
import { atributosDoParam, atributosParaParam, comFiltros, paginaDaUrl } from "./filtro-url";

describe("comFiltros — a gramática do filtro na URL (E129)", () => {
  it("default fica FORA da URL — a rota nua continua sendo a tela padrão", () => {
    const p = comFiltros(new URLSearchParams(), { filtro: "todos" }, { filtro: "todos" });
    expect(p.toString()).toBe("");
  });

  it("valor real entra; voltar ao default limpa", () => {
    const com = comFiltros(new URLSearchParams(), { filtro: "ATIVO" }, { filtro: "todos" });
    expect(com.get("filtro")).toBe("ATIVO");
    const limpo = comFiltros(com, { filtro: "todos" }, { filtro: "todos" });
    expect(limpo.toString()).toBe("");
  });

  it("busca apagada remove o param — vazio é ausência, não q=", () => {
    const p = comFiltros(new URLSearchParams("q=mariana"), { q: "" });
    expect(p.toString()).toBe("");
  });

  it("o resto da URL é dos outros: ?quando=historico atravessa intacto", () => {
    // O caso do backlog (cuidado do escopo): atendimentos já tinha ?quando na
    // URL e a migração não pode engoli-lo ao escrever os filtros novos.
    const p = comFiltros(new URLSearchParams("quando=historico"), { q: "ana" });
    expect(p.get("quando")).toBe("historico");
    expect(p.get("q")).toBe("ana");
  });

  it("mudar a busca zera a página no MESMO gesto — página 3 de outra busca não existe", () => {
    // Cuidado (c) do backlog: buscar da página 3 devolveria um vazio falso.
    const antes = new URLSearchParams("pagina=3");
    const p = comFiltros(antes, { q: "ana", pagina: null });
    expect(p.get("pagina")).toBeNull();
    expect(p.get("q")).toBe("ana");
  });

  it("número vira texto e página 1 é default implícito", () => {
    const p = comFiltros(new URLSearchParams(), { pagina: 2 }, { pagina: "1" });
    expect(p.get("pagina")).toBe("2");
    expect(comFiltros(p, { pagina: 1 }, { pagina: "1" }).get("pagina")).toBeNull();
  });
});

describe("paginaDaUrl — lixo na URL não derruba a tela", () => {
  it.each([
    ["", 1],
    ["pagina=3", 3],
    ["pagina=0", 1],
    ["pagina=-2", 1],
    ["pagina=abc", 1],
    ["pagina=2.5", 1],
  ])("'%s' → página %i", (query, esperado) => {
    expect(paginaDaUrl(new URLSearchParams(query))).toBe(esperado);
  });
});

describe("o codec do filtro por atributo (vestidos)", () => {
  it("ida e volta preserva o mapa", () => {
    const filtros = { "atr-1": "op-a", "atr-2": "op-b" };
    expect(atributosDoParam(atributosParaParam(filtros))).toEqual(filtros);
  });

  it("entrada malformada é descartada em silêncio", () => {
    expect(atributosDoParam("solto,semdois:pontos:demais,ok:sim")).toEqual({
      semdois: "pontos",
      ok: "sim",
    });
    expect(atributosDoParam(null)).toEqual({});
    expect(atributosDoParam("")).toEqual({});
  });
});
