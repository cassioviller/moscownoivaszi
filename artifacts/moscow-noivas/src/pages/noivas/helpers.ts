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

// `dataCurtaFmt` morava aqui: cópia campo a campo de `diaMesAbrevAno`
// (formatos.ts) — mesmas opções, mesmo UTC. As seis telas que a usavam passaram
// a chamar a régua direto.

// `moedaFmt` morava aqui — o SEGUNDO formatador de BRL do frontend, contra o
// invariante do `replit.md` ("todo dinheiro na tela sai de `brl()`", E92, que
// apagou 98 cópias). Como o irmão em `whatsapp.ts`, ele não divergia hoje: a
// string sai idêntica. O que ele fazia era manter viva a possibilidade de
// divergir amanhã, no único lugar em que o repo já pagou para não ter.

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

// O gate de permissão vive em `@/lib/permissoes` — `podeNoModulo(acessos,
// modulo, acao)`. `podeLeads` e a cópia local de `moduloLiberado` saíram daqui:
// o modelo deixou de ser plano, e um gate que só sabia responder "entra ou não
// entra" oferecia botões que o servidor recusava.
