/**
 * O gate de permissão no cliente — espelho do de `api-server/src/lib/permissoes.ts`.
 *
 * O servidor é a autoridade: ele recusa a chamada de qualquer jeito. Isto aqui
 * existe para a interface não OFERECER o que vai ser negado — um botão que
 * responde 403 é pior do que um botão que não existe.
 *
 * Duas regras herdadas do servidor:
 *
 * 1. **O módulo é o do BACKEND, não o da tela.** Quem gateia a configuração de
 *    cabines é `requireModulo("agenda")`, então a tela de config pergunta por
 *    `agenda`. Perguntar por um módulo que o servidor não conhece (era o caso
 *    de `config`) dá `undefined`, e `undefined` nega para todo mundo: um gate
 *    que sempre fecha não protege nada, só esconde a tela.
 *
 * 2. **`acessosModulos` nulo = sem restrição** (superadmin não tem perfil, tem
 *    bypass). Nulo NÃO é "sem acesso".
 */

export const ACOES = ["ver", "criar", "editar"] as const;
export type Acao = (typeof ACOES)[number];

/** O mapa que vem do `/auth/me`. Já normalizado pelo servidor. */
export type Acessos = Record<string, unknown> | null | undefined;

/**
 * Pode a ação neste módulo? Tolera o formato plano antigo (`true` = módulo
 * inteiro), como o servidor faz, para uma sessão aberta antes da mudança não
 * ver a interface travar.
 */
export function podeNoModulo(acessos: Acessos, modulo: string, acao: Acao): boolean {
  if (!acessos) return true; // superadmin: sem mapa, sem restrição
  const valor = acessos[modulo];
  if (valor === true) return true;
  if (!valor || typeof valor !== "object") return false;
  const m = valor as Record<string, unknown>;
  if (m[acao] === true) return true;
  // Coerência do servidor: quem cria ou edita, vê.
  return acao === "ver" && (m.criar === true || m.editar === true);
}

/** Um módulo aparece quando pode ao menos uma ação. É o gate do menu. */
export function moduloLiberado(acesso: unknown): boolean {
  if (acesso === true) return true;
  if (acesso && typeof acesso === "object") {
    return Object.values(acesso as Record<string, unknown>).some(Boolean);
  }
  return false;
}
