import { describe, it, expect } from "vitest";
import { normalizarAcessos, resolverAcessosEfetivos, lerAcessosDoForm } from "@/lib/permissoes/modulos";

describe("normalizarAcessos", () => {
  it("respeita valores conhecidos e completa shape", () => {
    const r = normalizarAcessos({ vestidos: { ver: true, criar: true, editar: false } });
    expect(r.vestidos).toEqual({ ver: true, criar: true, editar: false });
    expect(r.leads).toEqual({ ver: false, criar: false, editar: false });
    expect(Object.keys(r).sort()).toEqual(["ajustes", "config", "interesses", "leads", "vestidos"]);
  });

  it("descarta chaves desconhecidas (módulo e ação)", () => {
    const r = normalizarAcessos({
      vestidos: { ver: true, excluir: true },
      financeiro: { ver: true },
    }) as Record<string, unknown>;
    expect(r.financeiro).toBeUndefined();
    expect(r.vestidos).toEqual({ ver: true, criar: false, editar: false });
  });

  it("módulo/ação ausente → false (fail-closed)", () => {
    const r = normalizarAcessos({ vestidos: { criar: true } });
    // criar implica ver (coerção, abaixo); editar ausente → false
    expect(r.vestidos.editar).toBe(false);
    expect(r.interesses).toEqual({ ver: false, criar: false, editar: false });
  });

  it("coerção: criar OU editar ⇒ ver = true", () => {
    expect(normalizarAcessos({ vestidos: { criar: true } }).vestidos.ver).toBe(true);
    expect(normalizarAcessos({ leads: { editar: true } }).leads.ver).toBe(true);
    expect(normalizarAcessos({ leads: { ver: false, criar: false, editar: false } }).leads.ver).toBe(false);
  });

  it("entrada não-objeto → tudo false", () => {
    expect(normalizarAcessos(null).vestidos).toEqual({ ver: false, criar: false, editar: false });
    expect(normalizarAcessos("x").leads.ver).toBe(false);
  });
});

describe("resolverAcessosEfetivos", () => {
  const template = { vestidos: { ver: true, criar: false, editar: false } };
  const override = { vestidos: { ver: true, criar: true, editar: true } };

  it("override presente → usa override normalizado", () => {
    expect(resolverAcessosEfetivos(template, override).vestidos.criar).toBe(true);
  });
  it("override null → usa template normalizado", () => {
    expect(resolverAcessosEfetivos(template, null).vestidos.criar).toBe(false);
  });
});

describe("lerAcessosDoForm", () => {
  it("lê os checkboxes 'on' de todos os módulos declarados (inclui config)", () => {
    const fd = new FormData();
    fd.set("vestidos.ver", "on");
    fd.set("vestidos.criar", "on");
    fd.set("config.ver", "on"); // config agora tem grade própria (gestão do catálogo)
    const r = lerAcessosDoForm(fd);
    expect(r.vestidos).toEqual({ ver: true, criar: true, editar: false });
    expect(r.config.ver).toBe(true);
    expect(r.leads).toEqual({ ver: false, criar: false, editar: false });
  });
});
