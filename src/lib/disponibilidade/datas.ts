import type { Janela } from "./tipos";

/**
 * Parseia uma data-só "YYYY-MM-DD" para a meia-noite em UTC (Grill 4).
 * Sem horário/fuso na entrada → sem off-by-one. Rejeita formato inválido e
 * datas impossíveis ("2026-02-30", "2026-13-01") que Date.UTC normalizaria.
 */
export function parseDiaUTC(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    throw new Error(`Data inválida "${s}": esperado o formato "YYYY-MM-DD".`);
  }
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(`Data inválida "${s}": dia ou mês fora do calendário.`);
  }
  return d;
}

/**
 * Valida "YYYY-MM-DD" pelo parser estrito do motor (rejeita formato e datas
 * impossíveis, ex.: 2026-13-40). True = data utilizável. Mora aqui, junto do
 * parseDiaUTC que sustenta a regra — antes copiada em reservas.ts e provas.ts.
 */
export function diaValido(s: string): boolean {
  try {
    parseDiaUTC(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Soma (ou subtrai, com n negativo) dias a uma data em UTC.
 * Recebe sempre uma Date em UTC-meia-noite (de parseDiaUTC ou de outro addDias);
 * setUTCDate trata viradas de mês e ano corretamente.
 */
export function addDias(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/**
 * Duas janelas se sobrepõem se compartilham ao menos um dia.
 * Intervalos meio-abertos `[inicio, fim)`: `fim` é o primeiro dia livre, então
 * encostar na borda (`a.fim == b.inicio`) NÃO é conflito — back-to-back é permitido.
 */
export function janelasSobrepoem(a: Janela, b: Janela): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}
