/**
 * Permissões por MÓDULO × AÇÃO.
 *
 * O modelo antigo era plano — `{ leads: true }` — e respondia só "entra ou não
 * entra". Não dava para deixar alguém ver o financeiro sem poder mexer nele,
 * que é a pergunta que o atelier faz o tempo todo. Agora cada módulo tem
 * `{ ver, criar, editar }`.
 *
 * Duas regras que valem para sempre:
 *
 * 1. **A fonte da verdade do shape é o CÓDIGO, nunca o banco.** O jsonb aceita
 *    qualquer coisa; `normalizarAcessos` reconcilia o que veio contra
 *    MODULOS × ACOES. Chave desconhecida é descartada, ausente é `false`
 *    (fail-closed) — um módulo novo não nasce liberado para todo mundo porque
 *    ninguém lembrou de atualizar as linhas antigas.
 *
 * 2. **`criar` ou `editar` implica `ver`.** Poder criar um lead sem poder abrir
 *    a lista é um estado incoerente que a interface não sabe desenhar.
 */

export const MODULOS = ["leads", "agenda", "vestidos", "financeiro", "comissao", "admin"] as const;
export const ACOES = ["ver", "criar", "editar"] as const;

export type Modulo = (typeof MODULOS)[number];
export type Acao = (typeof ACOES)[number];
export type AcessosModulos = Record<Modulo, Record<Acao, boolean>>;

/**
 * Reconcilia um `acessosModulos` cru contra o shape atual.
 *
 * Aceita o formato PLANO antigo (`{ leads: true }`) e o traduz: `true` valia
 * "acesso ao módulo inteiro", então vira ver+criar+editar. Não é um alargamento
 * de permissão — é o que aquele `true` já significava. A ponte fica porque uma
 * linha não migrada tem que continuar respondendo o mesmo, e porque um perfil
 * gravado antes da mudança não deve ser silenciosamente trancado para fora.
 */
export function normalizarAcessos(raw: unknown): AcessosModulos {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as AcessosModulos;

  for (const modulo of MODULOS) {
    const valor = src[modulo];

    if (valor === true) {
      out[modulo] = { ver: true, criar: true, editar: true };
      continue;
    }
    if (valor === false || valor == null || typeof valor !== "object") {
      out[modulo] = { ver: false, criar: false, editar: false };
      continue;
    }

    const mod = valor as Record<string, unknown>;
    const criar = mod.criar === true;
    const editar = mod.editar === true;
    out[modulo] = { ver: mod.ver === true || criar || editar, criar, editar };
  }

  return out;
}

/**
 * Os acessos que de fato valem. Havendo override para o perfil×loja, ele
 * SUBSTITUI o template — não se mistura com ele. Um override meio-aplicado
 * seria impossível de auditar ("de onde veio esse acesso?").
 */
export function resolverAcessosEfetivos(template: unknown, override: unknown | null): AcessosModulos {
  return normalizarAcessos(override != null ? override : template);
}

/** Pode a ação neste módulo? Fail-closed: o que não foi concedido, não pode. */
export function podeNoModulo(acessos: unknown, modulo: string, acao: Acao): boolean {
  if (!(MODULOS as readonly string[]).includes(modulo)) return false;
  return normalizarAcessos(acessos)[modulo as Modulo][acao] === true;
}

/**
 * A ação que um método HTTP exige. GET lê; POST cria; PATCH/PUT/DELETE alteram.
 * DELETE é `editar` e não uma ação própria: quem pode alterar a agenda pode
 * desmarcar dela — separar isso criaria uma quarta coluna que ninguém pediu.
 */
export function acaoDoMetodo(metodo: string): Acao {
  const m = metodo.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "ver";
  if (m === "POST") return "criar";
  return "editar";
}
