// src/lib/financeiro/datas.ts
// Datas do financeiro na convenção do sistema: meia-noite UTC do dia-calendário em SP.
// Compartilhado por receber (S4) e pagar (S5).

export function hojeUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
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
