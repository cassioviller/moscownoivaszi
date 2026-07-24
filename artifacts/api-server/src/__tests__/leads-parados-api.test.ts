import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  type Fixture,
} from "./helpers";

/**
 * E79 — a régua do funil roda no banco. O sino (E68) e o painel (E66)
 * baixavam a lista COMPLETA de leads só para achar as paradas; agora só as
 * contagens e as 10 piores viajam, pela MESMA régua do funil-core.
 */
describe("GET /leads/parados (E79)", () => {
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

  it("conta por temperatura e devolve as piores primeiro — perdida e convertida não envelhecem", async () => {
    const critica = await criarLead(f);
    const atencao = await criarLead(f);
    const fresca = await criarLead(f);
    const perdida = await criarLead(f);

    const diasAtras = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d;
    };
    await db.update(leadsTable).set({ createdAt: diasAtras(20) }).where(eq(leadsTable.id, critica.id));
    await db.update(leadsTable).set({ createdAt: diasAtras(10) }).where(eq(leadsTable.id, atencao.id));
    await db.update(leadsTable)
      .set({ etapa: "PERDIDO", createdAt: diasAtras(60) })
      .where(eq(leadsTable.id, perdida.id));

    const res = await agent.get(`/api/lojas/${f.lojaId}/leads/parados`).expect(200);
    expect(res.body.criticos).toBe(1);
    expect(res.body.atencao).toBe(1);

    const ids = res.body.itens.map((i: { id: string }) => i.id);
    expect(ids[0]).toBe(critica.id);
    expect(ids).toContain(atencao.id);
    expect(ids).not.toContain(fresca.id);
    expect(ids).not.toContain(perdida.id);

    const pior = res.body.itens[0];
    expect(pior.temperatura).toBe("critico");
    expect(pior.dias).toBeGreaterThanOrEqual(19);
    expect(pior.noivaNome).toBe(critica.noivaNome);
  });
});
