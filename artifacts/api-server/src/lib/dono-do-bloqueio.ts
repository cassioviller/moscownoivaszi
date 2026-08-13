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
 *
 * ## S-C10 — o "61 das 63 avarias" morreu como frequência e vive como possibilidade
 *
 * Onze sítios do repositório justificavam o desenho acima com um número do
 * E110: *"61 das 63 avarias do banco de desenvolvimento vivem em bloqueio sem
 * noiva"* — 97%, o "caso comum", e recusá-lo "trocaria um defeito raro por uma
 * parede diária". **Remedido em 13/08/2026, nos dois bancos da instância:**
 *
 * | | `moscow_base` (o ateliê) | `heliumdb` (dev) |
 * |---|---|---|
 * | bloqueios `RESERVA_CASAMENTO` | 116 | 127 |
 * | com `lead_id` próprio | **116** | 125 |
 * | sem dono nenhuma (`lead_id` e `reservaId` nulos) | **0** | **2** |
 * | pendurados numa reserva-mãe | 115 | **0** |
 * | **avarias** | **0** | **0** |
 *
 * O denominador não existe mais e o numerador inverteu: **o bloqueio sem dona é
 * 0 de 116 na loja e 2 de 127 no dev** — e os 2 são resíduo de fixture de
 * 12/08/2026, sem reserva-mãe. As 63 avarias eram vazamento do spec 48, varrido
 * na faxina de `3b71a43` (S27/S-D22): **131 órfãs, 129 vestidos `AVA-`, 127
 * avarias** saíram de uma vez, e o `POST /contratos` passou a escrever
 * `bloqueio.lead_id` no E111. O que restou é o oposto do que o comentário
 * dizia.
 *
 * **A metade lógica do argumento sobrevive, e é ela que segura o desenho.**
 * `bloqueio_vestidos.lead_id` continua NULLABLE e `POST /lojas/:lojaId/bloqueios`
 * ainda aceita `RESERVA_CASAMENTO` sem `leadId` **e** sem `reservaId`
 * (`routes/reservas.ts:929`) — os 2 do dev são a prova de que o caminho está
 * aberto. Sem dona não há o que comparar, então toda guarda de pareamento
 * noiva↔peça tem de passar no nulo. **A metade estatística caiu**: "parede
 * diária" era medida em 97%, e hoje a parede teria largura ZERO na loja de
 * verdade. Quem for exigir dona na porta paga um custo que o número de 2026-07
 * proibia e o de 2026-08 não proíbe mais — é a **S-C60**, e não é conserto de
 * passagem.
 *
 * Todo sítio que citava o número aponta para cá. **Não repita o número em
 * comentário novo**: repita a régua, que é *o nulo é alcançável*.
 *
 * ## S-C80 — o nulo é alcançável, e onde ele cria DINHEIRO passou a ser recusado
 *
 * A régua acima continua valendo em toda leitura: `donoDoBloqueio` devolve
 * `null` e quem serializa um bloqueio entrega o nulo. O que mudou é uma porta
 * só, e é a que faz nascer parcela: `POST /avarias/:id/cobrar` recusa com 422
 * `AVARIA_SEM_DONA` em vez de deixar o reparo cair no carnê de qualquer noiva
 * ATIVA da loja (medido em 201 no S-C47, com R$ 1.500,00 num véu órfão).
 *
 * **Toda guarda de pareamento noiva↔peça continua tendo de passar no nulo** —
 * a de disponibilidade, a de escopo, a da agenda. A diferença é a assimetria
 * entre LER e COBRAR: ler o nulo é descrever o mundo, cobrar sobre o nulo é
 * escolher uma vítima.
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
