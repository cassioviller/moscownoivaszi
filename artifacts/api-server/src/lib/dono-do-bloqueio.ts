import { db, reservasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { DbExecutor } from "./disponibilidade";

/**
 * De QUEM é um bloqueio de vestido — a régua, num lugar só.
 *
 * `bloqueio_vestidos.lead_id` é NULLABLE e `reservas.lead_id` é NOT NULL: o véu
 * pendurado numa reserva-mãe TEM dona sem ter noiva própria. O V3/E163 escreveu
 * essa frase na cobrança da avaria, o V14/E167 a levou ao `GET`/`PATCH` do
 * bloqueio e o S-O17/E179 às cinco portas de `reservas.ts`. Ela morava dentro
 * de `routes/reservas.ts`, e por isso as **10 operações fora dele** que
 * serializam um `BloqueioVestido` aninhado continuaram devolvendo `undefined`
 * num campo que o contrato promete (S-O56).
 *
 * Aqui ela vira módulo, e as três formas terminam na mesma expressão (regra 26):
 *
 * - `comDono(bloqueio, maeLeadId)` — para quem já tem o `leadId` da mãe na mão;
 * - `bloqueioComDono(bloqueio)` — para quem trouxe a mãe pelo `with`, que é o
 *   caminho de custo ZERO: `MAE_DO_BLOQUEIO` acrescenta UMA coluna ao SELECT
 *   relacional que já estava sendo feito, não uma consulta por linha;
 * - `donoDoBloqueio(bloqueio, executor)` — para quem só tem os ids e paga a
 *   consulta.
 *
 * **Herdar o dono não é ser da noiva** (E179): os recortes `?leadId=` filtram
 * pelo `lead_id` PRÓPRIO, que é outra pergunta. Esta responde *de quem é o
 * reparo desta peça* — e, desde o S-O74, *de quem o contrato está prestes a
 * tomá-la*.
 */

/** O `with` que traz a mãe por UMA coluna do mesmo SELECT relacional. */
export const MAE_DO_BLOQUEIO = { reserva: { columns: { leadId: true } } } as const;

/** O bloqueio como ele chega das consultas que usam `MAE_DO_BLOQUEIO`. */
export type BloqueioComMae = { leadId: string | null; reserva?: { leadId: string } | null };

/** A régua, escrita para quem já carregou a reserva-mãe. */
export function comDono<T extends { leadId: string | null }>(
  bloqueio: T,
  maeLeadId: string | null,
): T & { donoLeadId: string | null } {
  return { ...bloqueio, donoLeadId: bloqueio.leadId ?? maeLeadId };
}

/** A mesma régua para quem trouxe a mãe no `with` — o caminho de custo zero. */
export function bloqueioComDono<T extends BloqueioComMae>(bloqueio: T): T & { donoLeadId: string | null };
export function bloqueioComDono<T extends BloqueioComMae>(
  bloqueio: T | null | undefined,
): (T & { donoLeadId: string | null }) | null;
export function bloqueioComDono<T extends BloqueioComMae>(
  bloqueio: T | null | undefined,
): (T & { donoLeadId: string | null }) | null {
  return bloqueio ? comDono(bloqueio, bloqueio.reserva?.leadId ?? null) : null;
}

/** Os bloqueios de uma reserva herdam o dono DELA — `reservas.lead_id` é NOT NULL. */
export function reservaComDonos<R extends { leadId: string; bloqueios: Array<{ leadId: string | null }> }>(
  reserva: R,
): R {
  return { ...reserva, bloqueios: reserva.bloqueios.map((b) => comDono(b, reserva.leadId)) };
}

/**
 * S-O56 — o atendimento carrega o bloqueio da PROVA, e é por ele que a agenda,
 * a grade e a fila de provas sabem qual peça a noiva vai vestir.
 */
export function atendimentoComDono<A extends { bloqueio?: BloqueioComMae | null }>(atendimento: A): A;
export function atendimentoComDono<A extends { bloqueio?: BloqueioComMae | null }>(
  atendimento: A | null | undefined,
): A | null;
export function atendimentoComDono<A extends { bloqueio?: BloqueioComMae | null }>(
  atendimento: A | null | undefined,
): A | null {
  if (!atendimento) return null;
  return { ...atendimento, bloqueio: bloqueioComDono(atendimento.bloqueio) };
}

/** S-O56 — a fila da costureira chega ao bloqueio por `ajuste → atendimento`. */
export function ajusteComDono<
  A extends { atendimento?: ({ bloqueio?: BloqueioComMae | null }) | null },
>(ajuste: A): A {
  return { ...ajuste, atendimento: atendimentoComDono(ajuste.atendimento) };
}

/**
 * A régua para quem só tem os ids — ela paga a consulta da mãe, e termina em
 * `comDono` para não virar uma segunda régua.
 */
export async function donoDoBloqueio(
  bloqueio: { leadId: string | null; reservaId: string | null },
  executor: DbExecutor = db,
): Promise<string | null> {
  if (bloqueio.leadId) return bloqueio.leadId;
  if (!bloqueio.reservaId) return null;
  const [mae] = await executor
    .select({ leadId: reservasTable.leadId })
    .from(reservasTable)
    .where(eq(reservasTable.id, bloqueio.reservaId));
  return comDono(bloqueio, mae?.leadId ?? null).donoLeadId;
}
