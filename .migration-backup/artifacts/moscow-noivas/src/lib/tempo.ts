// src/lib/tempo.ts
// Convenção de tempo do sistema, num lugar só. O dia-calendário vive à MEIA-NOITE UTC do dia
// em São Paulo: datas-só ("YYYY-MM-DD") viajam na borda e no banco são DateTime à meia-noite
// UTC, evitando off-by-one. Antes copiada inline em reservas, provas, atendimentos, painel,
// leads e financeiro/datas. Parsing ESTRITO (valida calendário) e a matemática de janelas do
// motor seguem em disponibilidade/datas.ts (parseDiaUTC, addDias) — específicos daquele domínio.
const FORMATADOR_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" do dia-calendário de hoje em São Paulo. */
export function hojeYMD(): string {
  return FORMATADOR_YMD.format(new Date());
}

/** "YYYY-MM-DD" → DateTime à meia-noite UTC. Lenient: não valida o calendário
 *  (use diaParaData de financeiro/datas, ou parseDiaUTC do motor, quando precisar validar). */
export function meiaNoiteUTC(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/** Hoje à meia-noite UTC do dia-calendário em São Paulo. */
export function hojeUTC(): Date {
  return meiaNoiteUTC(hojeYMD());
}

/** DateTime (meia-noite UTC) → "YYYY-MM-DD". null permanece null. */
export function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
