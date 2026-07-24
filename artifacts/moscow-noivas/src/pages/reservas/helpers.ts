/**
 * Helpers do atelier (Provas, Ajustes, Reservas) — porte do feat/orcamentos.
 *
 * Convenções de tempo do sistema:
 * - `casamentoData` é data de negócio (âncora meio-dia SP via diaParaISO) →
 *   exibir/contar em UTC (mesma convenção de src/pages/noivas/helpers.ts).
 * - `inicio` de atendimento é um instante real → exibir/contar no fuso local
 *   (mesma convenção da página Agenda).
 */

/** Mês por extenso + ano ("setembro de 2026") para datas de negócio (UTC). */
export const mesAnoFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Mês abreviado ("set.") para datas de negócio (UTC). */
export const mesAbrevFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** Mês por extenso + ano no fuso local, para instantes (provas). */
export const mesAnoLocalFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

/** Mês abreviado no fuso local, para instantes (provas). */
export const mesAbrevLocalFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

/** Data + hora no fuso local ("12 de setembro de 2026 14:30") para provas. */
export const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Data longa em UTC ("12 de setembro de 2026") para datas de negócio. */
export const dataLongaUTCFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Rótulos humanos da situação do atendimento, na voz da prova. */
export const ROTULO_SITUACAO: Record<string, string> = {
  AGENDADO: "Agendada",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluída",
  FALTOU: "Faltou",
};

/** Dias-calendário (fuso local) até um instante — para provas (Agenda usa local). */
export function diasAteLocal(iso: string): number {
  const alvo = new Date(iso);
  const hoje = new Date();
  const alvoDia = Date.UTC(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
  const hojeDia = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvoDia - hojeDia) / 86_400_000);
}

/**
 * Prazo do casamento na voz de uma fila de trabalho (pode estar atrasado):
 * "casamento passou" | "casamento hoje" | "casamento amanhã" | "casamento em N dias".
 */
export function prazoCasamento(dias: number): string {
  if (dias < 0) return "casamento passou";
  if (dias === 0) return "casamento hoje";
  if (dias === 1) return "casamento amanhã";
  return `casamento em ${dias} dias`;
}

export type GrupoMes<T> = { chave: string; rotulo: string; itens: T[] };

/**
 * Agrupa itens já ordenados por mês da data extraída (preserva a ordem de
 * entrada). `utc` decide se o mês-calendário é lido em UTC (datas de negócio)
 * ou no fuso local (instantes de prova).
 */
export function agruparPorMes<T>(
  itens: T[],
  dataDe: (item: T) => Date,
  fmt: Intl.DateTimeFormat,
  utc: boolean,
): GrupoMes<T>[] {
  const grupos: GrupoMes<T>[] = [];
  for (const item of itens) {
    const d = dataDe(item);
    const chave = utc
      ? `${d.getUTCFullYear()}-${d.getUTCMonth()}`
      : `${d.getFullYear()}-${d.getMonth()}`;
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) {
      grupo = { chave, rotulo: fmt.format(d), itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(item);
  }
  return grupos;
}
