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

/**
 * Rótulos e ordem dos módulos conhecidos — espelha o gate do backend/sidebar
 * (a lista `MODULOS` do api-server). Fonte única dos nomes de módulo na tela.
 */
export const MODULOS_ROTULOS: Record<string, string> = {
  // E92/E16: "Leads" era a única tela do app que chamava a noiva de lead — e
  // logo NA tela onde se decide quem vê o quê. O rótulo agora diz o alcance
  // real do módulo.
  //
  // E172: eram TRÊS itens de menu ("Noivas, orçamentos e contratos") e passaram
  // a ser UM. O rótulo não é decoração aqui — ele era a única linha do
  // repositório que dizia, para quem monta um perfil, que marcar esta caixa
  // entrega o contrato junto. Dizia, e ninguém leu (S-O40).
  //
  // Agora cada caixa da matriz governa uma coisa só, e o nome dela é essa
  // coisa. Quem monta um perfil de recepção marca "A ficha da noiva" inteira e
  // deixa as outras duas fechadas — e o que ele leu é o que vai acontecer.
  leads: "A ficha da noiva",
  orcamentos: "Orçamentos e propostas",
  contratos: "Contratos e parcelas",
  agenda: "Agenda",
  vestidos: "Vestidos",
  financeiro: "Financeiro",
  comissao: "Comissões",
  admin: "Administração da loja",
};

/**
 * Resumo textual dos acessos de um perfil, para a lista de perfis: só os
 * módulos com ao menos uma ação liberada, já com rótulo humano (nunca a chave
 * crua), na ordem canônica. Vazio vira "sem acessos".
 */
export function resumoAcessos(acessos: Acessos): string {
  if (!acessos) return "sem acessos";
  const nomes = Object.keys(MODULOS_ROTULOS)
    .concat(Object.keys(acessos).filter((m) => !(m in MODULOS_ROTULOS)))
    .filter((m) => moduloLiberado(acessos[m]))
    .map((m) => MODULOS_ROTULOS[m] ?? m);
  // Separador " · " e não ", ": os rótulos têm CONJUNÇÃO dentro ("Noivas e
  // orçamentos", "Contratos e parcelas"), e uma lista separada por vírgula
  // dessas não diz onde um item termina — lê-se como quatro coisas, não duas.
  // (Até o E172 o motivo era mais forte ainda: o rótulo de `leads` tinha uma
  // vírgula dentro, "Noivas, orçamentos e contratos".)
  return nomes.join(" · ") || "sem acessos";
}

/**
 * E80: o perfil do sistema é uma FLAG no banco (`sistema`), não um nome —
 * renomear o Admin não derruba mais o readonly da matriz. O nome fica como
 * fallback por uma versão, para linha antiga que ainda não passou pela
 * migração. (O servidor recusa PATCH/DELETE de quem carrega a flag; isto aqui
 * só decide o que a interface oferece.)
 */
export function ehPerfilAdmin(perfil: { nome: string; sistema?: boolean }): boolean {
  if (perfil.sistema !== undefined) return perfil.sistema;
  const n = perfil.nome.trim().toLowerCase();
  return n === "admin" || n === "administrador" || n === "administradora";
}
