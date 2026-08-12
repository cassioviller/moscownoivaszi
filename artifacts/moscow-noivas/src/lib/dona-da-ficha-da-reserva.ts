/**
 * S-O54/E185 — de quem é a peça que a ficha da reserva desenha.
 *
 * A ficha abre por BLOQUEIO (`/reservas/:bloqueioId`) e chama de "reserva" a
 * peça. Quando ela é um véu pendurado numa reserva-mãe, `bloqueio.lead_id` é
 * nulo e `bloqueio.lead` vem nulo junto: a tela escrevia o título como
 * **"Noiva"**, escondia a trilha para a ficha dela e afirmava, no card *De quem
 * é*, que **"esta reserva ainda não tem noiva"** — sobre uma peça cuja dona o
 * servidor sabe dizer desde o E167 (`donoLeadId`).
 *
 * O `donoLeadId` resolve o ID e não resolve o NOME: `BloqueioVestido.lead` é a
 * noiva PRÓPRIA do bloqueio, e não existe campo com a noiva da mãe. Quem tem o
 * nome é `GET /reservas/:reservaId`, a porta que o E179 abriu e que nenhuma
 * tela usava — é ela que este módulo consome.
 *
 * Três estados, e a tela precisa distinguir os três:
 *
 * - **própria** — a peça tem `lead_id`. Nada muda.
 * - **herdada** — a peça pende de uma reserva-mãe, e a dona é a da mãe. A tela
 *   nomeia a noiva e diz de onde o nome veio; trocar a noiva DESTA peça
 *   continua sendo um gesto sobre a peça, não sobre a mãe.
 * - **sem dona** — nem `lead_id`, nem mãe. É o caso que a adoção do E162
 *   resolve quando o contrato prende a peça, e é o único em que a frase
 *   "ainda não tem noiva" é verdadeira.
 */

export type OrigemDaDona = "propria" | "herdada" | "sem-dona";

export type DonaDaFicha = {
  /** A noiva de quem a peça é — o `lead_id` próprio, ou o da reserva-mãe. */
  leadId: string | null;
  /** O nome dela, quando alguma das duas pontas soube dizer. */
  nome: string | null;
  origem: OrigemDaDona;
};

type BloqueioDaFicha = {
  leadId?: string | null;
  donoLeadId?: string | null;
  reservaId?: string | null;
  lead?: { noivaNome?: string | null } | null;
};

type ReservaMae = {
  leadId?: string | null;
  lead?: { noivaNome?: string | null } | null;
} | null | undefined;

export function donaDaFicha(bloqueio: BloqueioDaFicha | null | undefined, mae: ReservaMae): DonaDaFicha {
  if (!bloqueio) return { leadId: null, nome: null, origem: "sem-dona" };
  if (bloqueio.leadId) {
    return { leadId: bloqueio.leadId, nome: bloqueio.lead?.noivaNome ?? null, origem: "propria" };
  }
  // O `donoLeadId` é a régua do servidor; a mãe é quem traz o nome. Quando a
  // consulta da mãe ainda não voltou, o id já basta para não mentir na frase.
  const herdado = bloqueio.donoLeadId ?? mae?.leadId ?? null;
  if (herdado) {
    return { leadId: herdado, nome: mae?.lead?.noivaNome ?? null, origem: "herdada" };
  }
  return { leadId: null, nome: null, origem: "sem-dona" };
}

/** A peça pende de uma mãe? É o que decide se vale perguntar por ela. */
export function temReservaMae(bloqueio: BloqueioDaFicha | null | undefined): boolean {
  return !!bloqueio?.reservaId;
}
