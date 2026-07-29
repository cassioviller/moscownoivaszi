/**
 * E25: as datas do financeiro moram no motor único (@workspace/financeiro-core)
 * — a MESMA régua de dia local/dia de negócio que o api-server usa. Porta
 * local; datas.test.ts ao lado prova o core.
 */
export {
  diaLocal,
  diaDeNegocio,
  hojeLocal,
  inicioDoDia,
  competenciaValida,
  competenciaAtual,
  addDias,
  diasEntre,
  ultimasCompetencias,
  resolverIntervalo,
  intervaloDaCompetencia,
  instanteNoIntervalo,
  negocioNoIntervalo,
} from "@workspace/financeiro-core";

const mesFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "2026-07" → "julho de 2026". A casa das datas de negócio é aqui; esta função
 * estava TRIPLICADA em comissoes, dre e fluxo (mais uma quarta cópia em
 * minha-comissao), e a folha nem a usava — mostrava "A competência 2026-07",
 * o formato do banco, três centímetros abaixo de um seletor que dizia
 * "July 2026" (E92/E15+E16).
 *
 * Devolve MINÚSCULA de propósito: em português o mês só sobe quando abre a
 * frase. Onde ele abre, use `capitalizar()` — e nunca o `capitalize` do CSS,
 * que sobe TODA palavra e produzia "Julho De 2026 — O Que Seria Pago Se
 * Fechasse Agora.".
 *
 * Meio-dia UTC evita escorregar de mês na coerção.
 */
export function rotuloCompetencia(competencia: string): string {
  return mesFmt.format(new Date(`${competencia}-01T12:00:00.000Z`));
}
