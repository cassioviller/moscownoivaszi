/**
 * Helpers do módulo Noivas (porte das telas do feat/orcamentos).
 * Datas de negócio nascem ancoradas ao meio-dia de São Paulo (diaParaISO em
 * src/lib/formatos.ts) — exibir/contar em UTC evita off-by-one.
 */

/** Formata a data do casamento por extenso ("sábado, 12 de setembro de 2026"). */
export const dataLongaFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Data curta ("12 de set. de 2026") para os cards da lista. */
export const dataCurtaFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Moeda BRL completa ("R$ 1.234,56"). */
export const moedaFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Dias (inteiros) até o casamento, comparando dias-calendário em UTC. */
export function diasAteCasamento(iso: string): number {
  const alvo = new Date(iso);
  const hoje = new Date();
  const alvoDia = Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), alvo.getUTCDate());
  const hojeDia = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((alvoDia - hojeDia) / 86_400_000);
}

/** Rótulo humano da contagem regressiva (só para dias >= 0). */
export function rotuloContagem(dias: number): string {
  if (dias === 0) return "É hoje";
  if (dias === 1) return "Falta 1 dia";
  return `Faltam ${dias} dias`;
}

/** Casamento a ≤14 dias pede atenção (mesmo limiar do orcamentos). */
export function casamentoUrgente(dias: number): boolean {
  return dias >= 0 && dias <= 14;
}

/** ISO → "YYYY-MM-DD" para inputs type=date (dia UTC = dia de negócio). */
export function isoParaDia(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Só os dígitos do WhatsApp, para montar o link wa.me. Vazio → null. */
export function whatsappDigits(whatsapp: string | null | undefined): string | null {
  const digits = (whatsapp ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Gate por módulo (padrão do sidebar): liberado se `true` ou objeto com algum
 * sub-acesso true. `acessosModulos` null/undefined = sem restrição (superadmin).
 * TODO Onda 4: nível-ação (ver/criar/editar) — hoje o modelo é flat por módulo.
 */
export function moduloLiberado(acesso: unknown): boolean {
  if (acesso === true) return true;
  if (acesso && typeof acesso === "object") {
    return Object.values(acesso as Record<string, unknown>).some(Boolean);
  }
  return false;
}

/** Módulo "leads" liberado para o usuário atual (noivas usa a chave de leads). */
export function podeLeads(acessosModulos: Record<string, unknown> | null): boolean {
  return !acessosModulos || moduloLiberado(acessosModulos["leads"]);
}
