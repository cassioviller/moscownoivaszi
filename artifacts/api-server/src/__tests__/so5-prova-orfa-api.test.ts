import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { atendimentosTable, auditLogTable, bloqueioVestidosTable, cabinesTable, db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-O5/R8 — **a prova que perde o vestido, e a trilha que a conta.**
 *
 * Cancelar a reserva soft-cancela os bloqueios (`reservas.ts:281-286`) para
 * devolver as peças ao acervo, e não tocava em `atendimentos`. Medido em
 * 2026-08-12, na porta:
 *
 * ```
 * DELETE /bloqueios       : 409 BLOQUEIO_COM_HISTORICO   ← a porta que RECUSA
 * PATCH reserva CANCELADA : 200                          ← a porta sem guarda
 * atendimento.situacao    : AGENDADO
 * outra noiva reservou a mesma peça: 201
 * provas AGENDADAS no bloqueio morto: 1
 * ```
 *
 * **A ironia é o achado:** o `DELETE /bloqueios` recusa com 409 porque os
 * atendimentos sumiriam junto (E115), e o comentário dele manda usar o
 * soft-cancel — a única saída sem guarda nenhuma.
 *
 * Decisão da dona: a prova FICA (a loja não sabe se a noiva desistiu ou está
 * trocando de vestido, e cancelar sozinho perderia o horário dela) e a TELA a
 * marca como órfã — a regra é derivada em `moscow-noivas/src/lib/prova-orfa.ts`,
 * sem coluna nova. O que o servidor passa a fazer é **contar**: sem o número na
 * trilha, "quantas noivas ficaram com prova marcada para um vestido que não é
 * mais delas" não se responde depois do fato.
 */
describe("S-O5 — o soft-cancel conta as provas que perderam o vestido", () => {
  let f: Fixture;
  let cabineId: string;

  beforeAll(async () => {
    f = await criarFixture();
    const [cabine] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, nome: `Cabine ${randomUUID().slice(0, 6)}` })
      .returning();
    cabineId = cabine!.id;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function reservaComProva(dias: number, offsetProva: number) {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = dataFutura(dias);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento,
    });
    const prova = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId,
        vendedoraId: f.vendedoraId,
        tipo: "PROVA",
        bloqueioId: bloqueio.id,
        inicio: dataFutura(offsetProva).toISOString(),
      })
      .expect(201);
    return { agent, lead, vestido, reserva, bloqueio, prova };
  }

  async function trilhaDoCancelamento(reservaId: string) {
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, reservaId), eq(auditLogTable.acao, "RESERVA_CANCELADA")))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(1);
    return linha?.detalhe as Record<string, unknown> | undefined;
  }

  it("a trilha diz QUANTAS provas ficaram sem o vestido, e quais", async () => {
    const { agent, reserva, prova } = await reservaComProva(180, 7);

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ status: "CANCELADA" })
      .expect(200);

    const detalhe = await trilhaDoCancelamento(reserva.id);
    expect(detalhe?.provasQuePerderamOVestido, "a contagem entra na trilha").toBe(1);
    expect(detalhe?.provasIds, "e os ids, para achar a noiva depois").toEqual([prova.body.id]);
    expect(detalhe?.bloqueiosSoltos).toBe(1);
  });

  it("reserva sem prova marcada conta zero — o normal da loja não vira alarme", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = dataFutura(190);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento,
    });

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ status: "CANCELADA" })
      .expect(200);

    const detalhe = await trilhaDoCancelamento(reserva.id);
    expect(detalhe?.provasQuePerderamOVestido).toBe(0);
    expect(detalhe?.provasIds).toEqual([]);
  });

  it("prova CONCLUÍDA não entra na conta — é história, não promessa", async () => {
    const { agent, reserva, prova } = await reservaComProva(200, 8);
    await db
      .update(atendimentosTable)
      .set({ situacao: "CONCLUIDO" })
      .where(eq(atendimentosTable.id, prova.body.id));

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ status: "CANCELADA" })
      .expect(200);

    const detalhe = await trilhaDoCancelamento(reserva.id);
    expect(detalhe?.provasQuePerderamOVestido, "a noiva já veio; o vestido não a espera mais").toBe(0);
  });

  /**
   * O estado que a tela precisa desenhar, medido no dado: depois do
   * cancelamento a prova continua de pé E o bloqueio dela está cancelado. É
   * exatamente o par que `provaPerdeuOVestido` procura, e é o que fazia a peça
   * ser alugada para outra noiva com a prova da primeira ainda marcada.
   */
  it("a prova continua de pé, e o bloqueio dela cancelado — o par que a tela lê", async () => {
    const { agent, reserva, bloqueio, prova } = await reservaComProva(210, 9);

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ status: "CANCELADA" })
      .expect(200);

    const lista = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos`)
      .query({ bloqueioId: bloqueio.id })
      .expect(200);

    const daProva = lista.body.find((a: { id: string }) => a.id === prova.body.id);
    expect(daProva, "a prova não sumiu da agenda").toBeDefined();
    expect(daProva.situacao).toBe("AGENDADO");
    expect(
      daProva.bloqueio?.canceladoEm,
      "e o `canceladoEm` viaja na resposta — é dele que a tela deriva o selo",
    ).not.toBeNull();

    const [b] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(b?.canceladoEm).not.toBeNull();
  });
});
