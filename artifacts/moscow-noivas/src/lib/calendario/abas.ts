// src/lib/calendario/abas.ts
// As abas do Calendário, num lugar só (PURO). A aba ativa vem da query (?aba=);
// valor ausente/desconhecido cai no padrão "mes". Sem isto espalhado pela UI.

export const ABAS = [
  { id: "mes", label: "Mês" },
  { id: "vestidos", label: "Vestidos fora" },
  { id: "atendimentos", label: "Atendimentos" },
  { id: "provas-ajustes", label: "Provas & ajustes" },
] as const;

export type AbaId = (typeof ABAS)[number]["id"];

/** Resolve a aba ativa a partir do valor cru da query. Desconhecido → "mes". */
export function resolverAba(raw: string | undefined): AbaId {
  return ABAS.some((a) => a.id === raw) ? (raw as AbaId) : "mes";
}
