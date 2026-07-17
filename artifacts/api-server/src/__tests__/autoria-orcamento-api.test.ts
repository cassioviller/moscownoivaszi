import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Gêmea do vendedorId da cobrança: quem abriu o orçamento vem da SESSÃO,
 * nunca do corpo. Aceitar um `vendedoraId` do cliente deixava atribuir o
 * orçamento (e a comissão que nasce dele) a outra pessoa.
 */
describe("Autoria do orçamento — sessão, não corpo", () => {
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

  it("vendedoraId forjado no corpo é ignorado: vale a sessão", async () => {
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id, vendedoraId: f.superAdminId })
      .expect(201);
    expect(orc.body.vendedoraId).toBe(f.vendedoraId);
  });

  it("sem vendedoraId no corpo, a autoria nasce da sessão", async () => {
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    expect(orc.body.vendedoraId).toBe(f.vendedoraId);
  });
});
