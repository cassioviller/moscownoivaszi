/**
 * Helpers do atelier (Provas, Ajustes, Reservas) — porte do feat/orcamentos.
 *
 * Convenções de tempo do sistema:
 * - `casamentoData` é data de negócio (âncora meio-dia SP via diaParaISO) →
 *   exibir/contar em UTC (mesma convenção de src/pages/noivas/helpers.ts).
 * - `inicio` de atendimento é um instante real → exibir/contar no fuso da LOJA
 *   (America/Sao_Paulo).
 *
 * D15/E99 — este cabeçalho dizia "fuso local (mesma convenção da página
 * Agenda)", e a Agenda faz o oposto: `grade.tsx` sempre passou
 * `timeZone: "America/Sao_Paulo"`. Os três formatadores abaixo herdavam o
 * relógio do NAVEGADOR, então a mesma prova das 14h aparecia às 19h para quem
 * abrisse de Lisboa — e o comentário mandava o próximo leitor confiar nisso,
 * citando como prova uma tela que discorda. Comentário que aponta para o lugar
 * errado é pior que comentário nenhum: desliga a suspeita de quem lê.
 */
import { diaLocal, diasEntre, hojeLocal } from "@/lib/financeiro/datas";

/** O relógio da loja: um atendimento das 14h é às 14h em qualquer lugar. */
const FUSO_LOJA = "America/Sao_Paulo";

/** Mês por extenso + ano ("setembro de 2026") para datas de negócio (UTC). */
export const mesAnoFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Mês abreviado ("set.") para datas de negócio (UTC). */
export const mesAbrevFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** Mês por extenso + ano no fuso da loja, para instantes (provas). */
export const mesAnoLocalFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: FUSO_LOJA });

/** Mês abreviado no fuso da loja, para instantes (provas). */
export const mesAbrevLocalFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: FUSO_LOJA });

/** Data + hora no fuso da loja ("12 de setembro de 2026 14:30") para provas. */
export const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
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

/**
 * Dias-calendário até um instante, no fuso DA LOJA (E115).
 *
 * Contava no fuso do NAVEGADOR — contradizendo o cabeçalho deste próprio
 * arquivo ("exibir/contar no fuso da LOJA") e a Agenda, que sempre passou
 * `America/Sao_Paulo`. Uma prova às 14h de SP vista de um fuso adiantado
 * contava um dia a mais.
 */
export function diasAteLocal(iso: string): number {
  return diasEntre(hojeLocal(), diaLocal(iso));
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
    // E115: o ramo não-UTC montava a CHAVE no fuso do navegador e o RÓTULO no
    // da loja — na virada do mês, o grupo abria com o nome de um mês e itens
    // do outro. Instante agrupa pelo dia da LOJA, como o rótulo sempre fez.
    const chave = utc
      ? `${d.getUTCFullYear()}-${d.getUTCMonth()}`
      : diaLocal(d).slice(0, 7);
    let grupo = grupos.find((g) => g.chave === chave);
    if (!grupo) {
      grupo = { chave, rotulo: fmt.format(d), itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(item);
  }
  return grupos;
}
