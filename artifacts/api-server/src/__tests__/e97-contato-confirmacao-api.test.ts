import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, atendimentosTable, auditLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E97/F6 — "a loja falou" e "a noiva respondeu" são fatos diferentes.
 *
 * Os dois moravam em `confirmado_em`. Abrir o WhatsApp pela fila do dia
 * carimbava o mesmo campo que o portal usa quando a noiva clica — antes de
 * escrever, antes de enviar, antes de ela ler. Depois de gravados eram
 * indistinguíveis: a linha sumia da fila e da contagem do sino nos dois casos,
 * e é sobre o segundo que o ateliê separa peça, cabine e costureira.
 */
describe("E97 — contato da loja × confirmação da noiva", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  let seq = 0;
  /** Uma prova futura AGENDADA, em horário próprio (UNIQUE loja+vendedora+inicio). */
  async function provaFutura() {
    const lead = await criarLead(f);
    const cabine = await agent
      .post(`/api/lojas/${f.lojaId}/cabines`)
      .send({ nome: `Cabine E97 ${seq}` })
      .expect(201);
    const inicio = new Date(dataFutura(30).getTime() + seq++ * 3_600_000);
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId: cabine.body.id,
        vendedoraId: f.vendedoraId,
        tipo: "PROVA",
        inicio: inicio.toISOString(),
      })
      .expect(201);
    return { lead, atendimento: r.body as { id: string } };
  }

  async function linha(id: string) {
    return db.query.atendimentosTable.findFirst({ where: eq(atendimentosTable.id, id) });
  }

  it("o clique da loja carimba contatadoEm e NÃO toca confirmadoEm", async () => {
    const { atendimento } = await provaFutura();

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`)
      .expect(200);

    expect(r.body.contatadoEm).toBeTruthy();
    expect(r.body.confirmadoEm).toBeNull();

    const gravado = await linha(atendimento.id);
    expect(gravado!.contatadoEm).not.toBeNull();
    expect(gravado!.confirmadoEm).toBeNull();
  });

  it("é idempotente: o segundo clique não reescreve o primeiro carimbo", async () => {
    const { atendimento } = await provaFutura();
    const um = await agent.post(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`).expect(200);
    const dois = await agent.post(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`).expect(200);
    expect(dois.body.contatadoEm).toBe(um.body.contatadoEm);
  });

  it("o desfazer limpa o contato e devolve a linha à fila", async () => {
    const { atendimento } = await provaFutura();
    await agent.post(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`).expect(200);

    const r = await agent
      .delete(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`)
      .expect(200);
    expect(r.body.contatadoEm).toBeNull();
    expect((await linha(atendimento.id))!.contatadoEm).toBeNull();
  });

  it("o desfazer da loja NÃO apaga a confirmação da noiva", async () => {
    const { atendimento } = await provaFutura();
    // A noiva confirmou (o que o portal faz), e a loja também tinha procurado.
    await db.update(atendimentosTable)
      .set({ confirmadoEm: new Date() })
      .where(eq(atendimentosTable.id, atendimento.id));
    await agent.post(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`).expect(200);

    await agent.delete(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`).expect(200);

    const gravado = await linha(atendimento.id);
    expect(gravado!.contatadoEm).toBeNull();
    expect(gravado!.confirmadoEm).not.toBeNull();
  });

  it("os dois campos são independentes — cada um responde por um fato", async () => {
    const { atendimento } = await provaFutura();
    const agora = new Date();
    await db.update(atendimentosTable)
      .set({ contatadoEm: agora, confirmadoEm: agora })
      .where(eq(atendimentosTable.id, atendimento.id));

    const gravado = await linha(atendimento.id);
    expect(gravado!.contatadoEm).not.toBeNull();
    expect(gravado!.confirmadoEm).not.toBeNull();
  });

  it("atendimento de outra loja responde 404 nas duas pontas", async () => {
    const outra = await criarFixture();
    try {
      const { atendimento } = await provaFutura();
      const alheio = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
      await alheio.post(`/api/lojas/${outra.lojaId}/atendimentos/${atendimento.id}/contato`).expect(404);
      await alheio.delete(`/api/lojas/${outra.lojaId}/atendimentos/${atendimento.id}/contato`).expect(404);
    } finally {
      await limparFixture(outra);
    }
  });

  /**
   * A premissa da migração, virada teste: o carimbo da noiva SEMPRE deixa uma
   * linha `PROVA_CONFIRMADA` na trilha, e o da loja nunca deixa. É isso que
   * permitiu separar os 16 registros antigos por evidência em vez de por chute
   * — o backlog dizia que não dava.
   */
  it("só a confirmação da noiva deixa PROVA_CONFIRMADA na trilha", async () => {
    const { atendimento } = await provaFutura();
    await agent.post(`/api/lojas/${f.lojaId}/atendimentos/${atendimento.id}/contato`).expect(200);

    const trilha = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.entidade, "atendimento"),
        eq(auditLogTable.entidadeId, atendimento.id),
        eq(auditLogTable.acao, "PROVA_CONFIRMADA"),
      ));
    expect(trilha).toHaveLength(0);
  });
});
