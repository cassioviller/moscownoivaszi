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

// S30: quatro formatadores de mês (UTC/loja × longo/abreviado) e a data longa
// UTC moravam aqui e eram opção-sets gerais, não voz desta tela — viraram as
// funções públicas `mesAnoLongo`, `mesAbrev`, `instanteMesAno`,
// `instanteMesAbrev` e `diaMesAnoLongo` de `@/lib/formatos`. Só fica o que é
// desta tela:

/**
 * Data + hora no fuso da loja ("12 de setembro de 2026, 14:30") para provas.
 * S30: fica — a régua tem `instanteCurto` (numérico) e `instanteLongo` (sem
 * hora); a prova na ficha da reserva fala a data por extenso E a hora, e este
 * é o único sítio que junta os dois.
 */
export const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_LOJA,
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
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

// S35: `prazoCasamento` morava aqui com zero usos no repositório (provado por
// `git ls-files` + grep) — a fila de confecção fala esse prazo por conta
// própria. Exportação sem chamador é API fantasma; saiu.

export type GrupoMes<T> = { chave: string; rotulo: string; itens: T[] };

/**
 * Agrupa itens já ordenados por mês da data extraída (preserva a ordem de
 * entrada). `utc` decide se o mês-calendário é lido em UTC (datas de negócio)
 * ou no fuso local (instantes de prova). O rótulo vem de fora como FUNÇÃO
 * (S30): as duas chamadas passam a régua (`mesAnoLongo`/`instanteMesAno`) em
 * vez de um `Intl` local.
 */
export function agruparPorMes<T>(
  itens: T[],
  dataDe: (item: T) => Date,
  rotuloDe: (d: Date) => string,
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
      grupo = { chave, rotulo: rotuloDe(d), itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(item);
  }
  return grupos;
}
