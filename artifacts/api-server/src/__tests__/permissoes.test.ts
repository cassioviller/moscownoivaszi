import { describe, expect, it } from "vitest";
import {
  ACOES,
  MODULOS,
  acaoDoMetodo,
  acaoDoRequest,
  normalizarAcessos,
  podeNoModulo,
  resolverAcessosEfetivos,
} from "../lib/permissoes";

const TUDO = { ver: true, criar: true, editar: true };
const NADA = { ver: false, criar: false, editar: false };

describe("normalizarAcessos — shape vem do código, não do banco", () => {
  it("cobre todos os módulos, mesmo os ausentes no dado cru", () => {
    const acessos = normalizarAcessos({ leads: { ver: true } });
    expect(Object.keys(acessos).sort()).toEqual([...MODULOS].sort());
    // Fail-closed: o que não veio, não pode.
    expect(acessos.financeiro).toEqual(NADA);
  });

  it("descarta chave desconhecida — módulo que não existe não vira acesso", () => {
    const acessos = normalizarAcessos({ modulo_fantasma: { ver: true }, leads: { ver: true } });
    expect("modulo_fantasma" in acessos).toBe(false);
    expect(acessos.leads.ver).toBe(true);
  });

  it("entrada inválida não derruba nem libera nada", () => {
    for (const lixo of [null, undefined, "sim", 42, []]) {
      expect(normalizarAcessos(lixo).leads).toEqual(NADA);
    }
  });
});

describe("normalizarAcessos — coerência criar/editar ⇒ ver", () => {
  it("quem cria, vê", () => {
    expect(normalizarAcessos({ leads: { criar: true } }).leads).toEqual({
      ver: true,
      criar: true,
      editar: false,
    });
  });

  it("quem edita, vê", () => {
    expect(normalizarAcessos({ leads: { editar: true } }).leads).toEqual({
      ver: true,
      criar: false,
      editar: true,
    });
  });

  it("ver sozinho não concede escrita", () => {
    expect(normalizarAcessos({ financeiro: { ver: true } }).financeiro).toEqual({
      ver: true,
      criar: false,
      editar: false,
    });
  });

  it("valor que não é literalmente true não concede", () => {
    // "on", 1 e "true" vêm de form/query e não podem virar permissão por acidente.
    expect(normalizarAcessos({ leads: { ver: "on", criar: 1, editar: "true" } }).leads).toEqual(NADA);
  });
});

describe("normalizarAcessos — ponte do formato plano antigo", () => {
  /**
   * Os seis módulos que existiam quando o formato PLANO era o formato — a lista
   * é literal de propósito. `MODULOS` cresce (o E172 lhe acrescentou
   * `contratos`), e uma linha gravada em 2025 não pode ser cobrada por um
   * módulo que nasceu em 2026: o teste passaria a medir o futuro contra o
   * passado.
   */
  const MODULOS_DO_FORMATO_PLANO = ["leads", "agenda", "vestidos", "financeiro", "comissao", "admin"] as const;

  it("`true` era acesso ao módulo inteiro e continua sendo", () => {
    // O perfil Admin gravado antes da mudança não pode ser trancado para fora.
    const admin = { admin: true, leads: true, agenda: true, comissao: true, vestidos: true, financeiro: true };
    const acessos = normalizarAcessos(admin);
    for (const m of MODULOS_DO_FORMATO_PLANO) expect(acessos[m]).toEqual(TUDO);
  });

  /**
   * E172 — **o preço de um módulo NOVO, escrito onde ele se paga.**
   *
   * `contratos` nasceu em 2026-08-12, depois de toda linha que já estava no
   * banco. A regra 1 deste módulo é fail-closed ("módulo novo não nasce
   * liberado porque ninguém lembrou de atualizar as linhas antigas"), e o
   * resultado é que **numa instalação que já existe, a Vendedora para de fechar
   * contrato até a migração rodar** — o `acessosModulos` dela não tem a chave.
   *
   * Isso não é defeito: é a fail-closed funcionando, e é preferível ao inverso
   * (um módulo novo abrindo sozinho para quem nunca o recebeu). Mas é uma
   * afirmação sobre o mundo, e ela tem endereço:
   * `docs/migracoes/2026-08-12-e172-modulo-contratos.sql`.
   */
  it("módulo que nasceu depois da linha vem FECHADO — é o que a migração paga", () => {
    const vendedoraDeOntem = { leads: true, agenda: true, vestidos: true };
    expect(normalizarAcessos(vendedoraDeOntem).contratos).toEqual(NADA);
  });

  it("`false` continua sendo nada", () => {
    const vendedora = { admin: false, leads: true, agenda: true, comissao: false, vestidos: true, financeiro: false };
    const acessos = normalizarAcessos(vendedora);
    expect(acessos.financeiro).toEqual(NADA);
    expect(acessos.comissao).toEqual(NADA);
    expect(acessos.admin).toEqual(NADA);
    expect(acessos.leads).toEqual(TUDO);
  });

  it("é idempotente: normalizar o já normalizado não muda nada", () => {
    const uma = normalizarAcessos({ leads: true, financeiro: false });
    expect(normalizarAcessos(uma)).toEqual(uma);
  });
});

describe("resolverAcessosEfetivos", () => {
  it("sem override, vale o template", () => {
    expect(resolverAcessosEfetivos({ leads: true }, null).leads).toEqual(TUDO);
  });

  it("o override SUBSTITUI o template, não se mistura", () => {
    // O template dá leads e financeiro; o override só dá leads:ver.
    // Se misturasse, o financeiro vazaria para dentro do override.
    const efetivos = resolverAcessosEfetivos(
      { leads: true, financeiro: true },
      { leads: { ver: true } },
    );
    expect(efetivos.leads).toEqual({ ver: true, criar: false, editar: false });
    expect(efetivos.financeiro).toEqual(NADA);
  });

  it("override vazio tranca tudo — é uma escolha, não um esquecimento", () => {
    const efetivos = resolverAcessosEfetivos({ leads: true }, {});
    expect(efetivos.leads).toEqual(NADA);
  });
});

describe("podeNoModulo", () => {
  it("responde por ação", () => {
    const acessos = { financeiro: { ver: true, criar: false, editar: false } };
    expect(podeNoModulo(acessos, "financeiro", "ver")).toBe(true);
    expect(podeNoModulo(acessos, "financeiro", "criar")).toBe(false);
    expect(podeNoModulo(acessos, "financeiro", "editar")).toBe(false);
  });

  it("módulo desconhecido nunca pode", () => {
    expect(podeNoModulo({ fantasma: true }, "fantasma", "ver")).toBe(false);
  });
});

describe("acaoDoMetodo", () => {
  it("mapeia o método HTTP para a ação", () => {
    expect(acaoDoMetodo("GET")).toBe("ver");
    expect(acaoDoMetodo("head")).toBe("ver");
    expect(acaoDoMetodo("POST")).toBe("criar");
    expect(acaoDoMetodo("PATCH")).toBe("editar");
    expect(acaoDoMetodo("PUT")).toBe("editar");
    expect(acaoDoMetodo("DELETE")).toBe("editar");
  });

  it("método desconhecido cai em editar — a ação mais restrita", () => {
    expect(acaoDoMetodo("TRACE")).toBe("editar");
  });

  it("toda ação devolvida é uma ação válida", () => {
    for (const m of ["GET", "POST", "PATCH", "DELETE"]) {
      expect(ACOES).toContain(acaoDoMetodo(m));
    }
  });
});

describe("acaoDoRequest", () => {
  it("cancelar/estornar são POST mas exigem editar — mutam recurso existente", () => {
    expect(acaoDoRequest("POST", "/api/lojas/1/contratos/2/cancelar")).toBe("editar");
    expect(acaoDoRequest("POST", "/api/lojas/1/parcelas/2/estornar")).toBe("editar");
    expect(acaoDoRequest("POST", "/api/lojas/1/financeiro/pagamentos/2/estornar")).toBe("editar");
  });

  it("POST comum continua criar; demais métodos seguem o método", () => {
    expect(acaoDoRequest("POST", "/api/lojas/1/contratos")).toBe("criar");
    expect(acaoDoRequest("GET", "/api/lojas/1/contratos")).toBe("ver");
    expect(acaoDoRequest("DELETE", "/api/lojas/1/parcelas/2")).toBe("editar");
    // Não casa no meio do caminho, só no fim.
    expect(acaoDoRequest("POST", "/api/lojas/1/cancelar/algo")).toBe("criar");
  });
});
