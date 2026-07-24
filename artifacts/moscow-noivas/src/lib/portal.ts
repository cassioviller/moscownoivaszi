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

/** Vivo = não revogado e não expirado. */
export function portalVivo(p: PortalStatusLike | null | undefined): boolean {
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
