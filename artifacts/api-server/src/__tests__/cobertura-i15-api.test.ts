import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, saldosReferenciaTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Cobertura de endpoints que existiam sem teste (I15) e a âncora de saldo (I11b).
 */
describe("Cobertura I15 + saldo ancorado (API)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("recusar orçamento: RASCUNHO → 204; recusar de novo → 422", async () => {
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orc.id}/recusar`).expect(204);
    const dupla = await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orc.id}/recusar`).expect(422);
    expect(dupla.body.error).toBe("TRANSICAO_INVALIDA");
  });

  it("recusar orçamento inexistente é 404", async () => {
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${randomUUID()}/recusar`).expect(404);
  });

  it("regra de disponibilidade: loja sem regra é 404; PUT persiste e o GET a devolve", async () => {
    await agent.get(`/api/lojas/${f.lojaId}/disponibilidade/regras`).expect(404);

    const corpo = { provaDiasAntes: 20, usoDiasAntes: 2, usoDiasDepois: 3, lavagemDiasDepois: 4 };
    const put = await agent.put(`/api/lojas/${f.lojaId}/disponibilidade/regras`).send(corpo).expect(200);
    expect(put.body).toMatchObject(corpo);

    const get = await agent.get(`/api/lojas/${f.lojaId}/disponibilidade/regras`).expect(200);
    expect(get.body).toMatchObject(corpo);

    // PUT de novo faz upsert (não duplica): muda um campo e o GET reflete.
    await agent.put(`/api/lojas/${f.lojaId}/disponibilidade/regras`).send({ ...corpo, provaDiasAntes: 30 }).expect(200);
    const get2 = await agent.get(`/api/lojas/${f.lojaId}/disponibilidade/regras`).expect(200);
    expect(get2.body.provaDiasAntes).toBe(30);
  });

  it("saldo: conferir o mesmo dia duas vezes corrige, não empilha (I11b)", async () => {
    // Duas conferências do MESMO dia local, em instantes diferentes: antes,
    // viravam duas âncoras (o dedup por timestamp cru não pegava). Agora ambas
    // ancoram ao meio-dia SP do dia → conflito → correção.
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/saldos-referencia`)
      .send({ dataReferencia: "2026-03-10T09:00:00-03:00", valor: 1000 })
      .expect(200);
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/saldos-referencia`)
      .send({ dataReferencia: "2026-03-10T22:00:00-03:00", valor: 1500 })
      .expect(200);

    const saldos = await db.select().from(saldosReferenciaTable).where(eq(saldosReferenciaTable.lojaId, f.lojaId));
    const doDia = saldos.filter((s) => s.dataReferencia.toISOString().slice(0, 10) === "2026-03-10");
    expect(doDia).toHaveLength(1); // uma âncora, não duas
    expect(doDia[0].valor).toBe(1500); // corrigido para o último valor
    // Ancorado ao meio-dia SP (15:00 UTC), não à hora crua enviada.
    expect(doDia[0].dataReferencia.toISOString()).toBe("2026-03-10T15:00:00.000Z");
  });
});
