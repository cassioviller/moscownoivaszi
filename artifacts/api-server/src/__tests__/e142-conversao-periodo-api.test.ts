import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  type Fixture,
} from "./helpers";

/**
 * E142 (D7) — o relatório de conversão aprende "e neste período?".
 *
 * A rota agregava por origem e motivo sobre TODOS os leads da história — o
 * WHERE era só lojaId. A dona que trocou o investimento de canal quer saber
 * se funcionou três meses depois, e a campanha nova ficava invisível na média
 * de 3 anos. A fixture tem DUAS épocas: o recorte conta só a pedida, a taxa
 * fecha com numerador E denominador do mesmo período, e sem params o
 * comportamento é o histórico de sempre.
 */
describe("Conversão por período (E142)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let ids: string[] = [];

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);

    // Época ANTIGA (2024): 2 leads SITE, 1 convertido.
    // Época NOVA (últimos 30 dias): 3 leads INSTAGRAM, 2 convertidos.
    const antigo1 = await criarLead(f);
    const antigo2 = await criarLead(f);
    const novo1 = await criarLead(f);
    const novo2 = await criarLead(f);
    const novo3 = await criarLead(f);
    ids = [antigo1.id, antigo2.id, novo1.id, novo2.id, novo3.id];

    const em2024 = new Date("2024-03-10T15:00:00-03:00");
    await db.update(leadsTable)
      .set({ origem: "SITE", createdAt: em2024, etapa: "CONTRATO_FECHADO" })
      .where(inArray(leadsTable.id, [antigo1.id]));
    await db.update(leadsTable)
      .set({ origem: "SITE", createdAt: em2024, etapa: "NOVO" })
      .where(inArray(leadsTable.id, [antigo2.id]));
    await db.update(leadsTable)
      .set({ origem: "INSTAGRAM", etapa: "CONTRATO_FECHADO" })
      .where(inArray(leadsTable.id, [novo1.id, novo2.id]));
    await db.update(leadsTable)
      .set({ origem: "INSTAGRAM", etapa: "NOVO" })
      .where(inArray(leadsTable.id, [novo3.id]));
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("com de/ate, o agregado conta SÓ a época pedida — e a taxa fecha no período", async () => {
    const hoje = new Date();
    const de = new Date(hoje.getTime() - 30 * 24 * 3_600_000).toISOString().slice(0, 10);
    const ate = hoje.toISOString().slice(0, 10);
    const r = await agent
      .get(`/api/lojas/${f.lojaId}/leads/conversao?de=${de}&ate=${ate}`)
      .expect(200);
    const instagram = r.body.porOrigem.find((o: { origem: string }) => o.origem === "INSTAGRAM");
    const indicacao = r.body.porOrigem.find((o: { origem: string }) => o.origem === "SITE");
    // A época nova inteira, com numerador e denominador do MESMO período.
    expect(instagram).toMatchObject({ total: 3, convertidos: 2 });
    // A época antiga fica FORA do recorte.
    expect(indicacao).toBeUndefined();
  });

  it("sem params, o comportamento é o de hoje: a história inteira", async () => {
    const r = await agent.get(`/api/lojas/${f.lojaId}/leads/conversao`).expect(200);
    const indicacao = r.body.porOrigem.find((o: { origem: string }) => o.origem === "SITE");
    expect(indicacao).toMatchObject({ total: 2, convertidos: 1 });
  });
});
