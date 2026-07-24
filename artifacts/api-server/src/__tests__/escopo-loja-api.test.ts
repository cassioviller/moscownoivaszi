import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable, cabinesTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * Escopo de loja nas ESCRITAS (regressão de segurança C2).
 *
 * O guard garante acesso à loja da URL, não que os IDs do corpo são dela. Sem
 * validação, a loja A criava atendimento/reserva/bloqueio referenciando lead e
 * cabine da loja B — e o GET enriquecido puxava os dados alheios para dentro.
 */
describe("Escopo de loja nas escritas (API)", () => {
  let A: Fixture;
  let B: Fixture;
  let agenteA: Awaited<ReturnType<typeof loginComLoja>>;
  let leadA: string;
  let cabineA: string;
  let leadB: string;
  let cabineB: string;

  beforeAll(async () => {
    A = await criarFixture();
    B = await criarFixture();
    agenteA = await loginComLoja(A.superAdminEmail, A.lojaId);

    leadA = randomUUID();
    leadB = randomUUID();
    cabineA = randomUUID();
    cabineB = randomUUID();
    await db.insert(leadsTable).values([
      { id: leadA, lojaId: A.lojaId, noivaNome: "Noiva A" },
      { id: leadB, lojaId: B.lojaId, noivaNome: "Noiva B" },
    ]);
    await db.insert(cabinesTable).values([
      { id: cabineA, lojaId: A.lojaId, nome: "Cabine A" },
      { id: cabineB, lojaId: B.lojaId, nome: "Cabine B" },
    ]);
  });

  afterAll(async () => {
    await limparFixture(A);
    await limparFixture(B);
    await fecharPool();
  });

  const novoAtendimento = (leadId: string, cabineId: string, vendedoraId: string) => ({
    leadId, cabineId, vendedoraId, inicio: "2027-05-01T13:00:00.000Z",
  });

  it("atendimento com lead de OUTRA loja é 404", async () => {
    await agenteA
      .post(`/api/lojas/${A.lojaId}/atendimentos`)
      .send(novoAtendimento(leadB, cabineA, A.vendedoraId))
      .expect(404);
  });

  it("atendimento com cabine de OUTRA loja é 404", async () => {
    await agenteA
      .post(`/api/lojas/${A.lojaId}/atendimentos`)
      .send(novoAtendimento(leadA, cabineB, A.vendedoraId))
      .expect(404);
  });

  it("atendimento com vendedora de OUTRA loja é 404", async () => {
    await agenteA
      .post(`/api/lojas/${A.lojaId}/atendimentos`)
      .send(novoAtendimento(leadA, cabineA, B.vendedoraId))
      .expect(404);
  });

  it("atendimento com tudo da própria loja passa (201)", async () => {
    await agenteA
      .post(`/api/lojas/${A.lojaId}/atendimentos`)
      .send(novoAtendimento(leadA, cabineA, A.vendedoraId))
      .expect(201);
  });

  it("reserva com lead de OUTRA loja é 404", async () => {
    await agenteA
      .post(`/api/lojas/${A.lojaId}/reservas`)
      .send({ leadId: leadB, casamentoData: "2027-12-01T15:00:00.000Z" })
      .expect(404);
  });

  it("reserva com lead da própria loja passa (201)", async () => {
    await agenteA
      .post(`/api/lojas/${A.lojaId}/reservas`)
      .send({ leadId: leadA, casamentoData: "2027-12-01T15:00:00.000Z" })
      .expect(201);
  });
});
