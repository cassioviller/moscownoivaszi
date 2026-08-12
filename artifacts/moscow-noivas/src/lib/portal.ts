/**
 * E84 — a régua do portal (E78) num lugar só: o card da ficha e as mensagens
 * de wa.me decidem "está vivo?" pela MESMA função, e o link nasce do mesmo
 * molde. Link morto na mensagem é pior que nenhum.
 */

export type PortalStatusLike = {
  token: string;
  expiraEm: string | Date;
  revogadoEm?: string | Date | null;
};

/**
 * Vivo = não revogado e não expirado.
 *
 * **S-O65 (E187)** — a resposta vem com o PORTAL garantido, como a do
 * `temDesconto` veio com o número (S-O13/E181). O card da ficha guardava o
 * veredito num `const vivo` e, dentro do `{vivo && …}`, afirmava `portal!` em
 * quatro lugares para ler token, validade e último acesso. A asserção estava
 * certa — "vivo" implica "existe" desde a primeira linha desta função —, e é
 * exatamente a classe que a S-O16 descreve: ela sobrevive a quem mexer aqui.
 * Com o predicado, o `const portal` estreita sozinho dentro do `&&`, e o `!`
 * some sem que ninguém precise lembrar por quê.
 *
 * **O ramo FALSO deste predicado não é uma resposta sobre existência.** Para o
 * TypeScript, `else` aqui significa `null | undefined`; para o ateliê, "não
 * está vivo" também é o portal REVOGADO, que existe e tem `revogadoEm` para
 * ler. Quem precisar do portal morto pergunta pelo `portal` direto, não pelo
 * `else` do vivo — e é por isso que a irmã `portalVencido` continua boolean:
 * lá o ramo falso é justamente um portal vivo.
 */
export function portalVivo<T extends PortalStatusLike>(p: T | null | undefined): p is T {
  if (!p || p.revogadoEm) return false;
  return new Date(p.expiraEm) > new Date();
}

export function linkDoPortal(token: string): string {
  return `${window.location.origin}/noiva/${token}`;
}

/**
 * leadId → URL do portal VIVO, a partir do lote de `GET /portais`. Quem não
 * tem portal (ou tem um morto) simplesmente não aparece no mapa.
 */
export function urlsDePortalPorLead(
  portais: readonly (PortalStatusLike & { leadId: string })[] | undefined,
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const p of portais ?? []) {
    if (portalVivo(p)) mapa.set(p.leadId, linkDoPortal(p.token));
  }
  return mapa;
}

/**
 * F38/E100 — quem some do mapa acima **por vencimento**, e só por isso.
 *
 * O mapa de cima responde "há link?" e é tudo o que a mensagem precisa saber.
 * O que ele não conta é POR QUE alguém não está nele, e a diferença é toda:
 *
 * - **vencido** — a loja gerou, a noiva não voltou em 30 dias. Ninguém decidiu
 *   isso; simplesmente aconteceu, e a mensagem passa a sair sem o link em
 *   silêncio. É o único caso que merece aviso.
 * - **revogado** — a loja MATOU o link de propósito. Cobrar um novo seria
 *   discutir com a decisão de quem a tomou.
 * - **sem portal nenhum** — ela nunca teve um. Marcar isso poria um alerta em
 *   quase toda linha da fila, e aviso que aparece sempre não é lido nunca.
 */
export function portalVencido(p: PortalStatusLike | null | undefined): boolean {
  if (!p || p.revogadoEm) return false;
  return new Date(p.expiraEm) <= new Date();
}

/** O mesmo veredito sobre o lote de `GET /portais`, por leadId. */
export function leadsComPortalVencido(
  portais: readonly (PortalStatusLike & { leadId: string })[] | undefined,
): Set<string> {
  const vencidos = new Set<string>();
  for (const p of portais ?? []) {
    if (portalVencido(p)) vencidos.add(p.leadId);
  }
  return vencidos;
}
