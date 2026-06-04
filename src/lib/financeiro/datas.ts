// src/lib/financeiro/datas.ts
// Datas do financeiro na convenção do sistema: meia-noite UTC do dia-calendário em SP.
// Compartilhado por receber (S4) e pagar (S5).

// "YYYY-MM-DD" do dia-calendário em SP (fonte única da convenção de fuso).
export function hojeYMD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function hojeUTC(): Date {
  return new Date(`${hojeYMD()}T00:00:00.000Z`);
}

// "YYYY-MM-DD" → meia-noite UTC; lança se inválida.
export function diaParaData(s: string): Date {
  const t = (s ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error("data inválida");
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("data inválida");
  // Rejeita data de calendário inexistente (ex.: 2027-02-30, que o Date rola pra março).
  if (d.toISOString().slice(0, 10) !== t) throw new Error("data inválida");
  return d;
}

// — Competência "YYYY-MM" (mês de obrigação na comissão/folha; mês do movimento no caixa) —

export function competenciaValida(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** Competência "YYYY-MM" do mês corrente (no fuso do sistema). */
export function competenciaAtual(): string {
  return hojeYMD().slice(0, 7);
}

/** Intervalo [gte, lt) de uma competência "YYYY-MM" em meia-noite UTC (convenção do sistema). */
export function competenciaRange(competencia: string): { gte: Date; lt: Date } {
  const y = Number(competencia.slice(0, 4));
  const m = Number(competencia.slice(5, 7)); // 1..12
  const gte = new Date(Date.UTC(y, m - 1, 1));
  const lt = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return { gte, lt };
}
