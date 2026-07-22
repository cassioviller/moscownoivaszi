import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  criarContrato,
  type Fixture,
} from "./helpers";

/**
 * E76 — a rede numa tela. Uma linha por loja ativa com funil, contratos,
 * recebido do mês e aberto a receber; gate superadmin (é a visão de quem
 * enxerga o banco inteiro).
 */
describe("Consolidado da rede (E76)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    await criarContrato(f, { leadId: lead.id, valorTotal: 4000, fechadoEm: new Date() });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("uma linha por loja, com os números da fixture", async () => {
    const res = await admin.get("/api/admin/consolidado").expect(200);
    const minha = res.body.find((l: { lojaId: string }) => l.lojaId === f.lojaId);
    expect(minha).toBeTruthy();
    expect(minha.leadsAtivos).toBeGreaterThanOrEqual(1);
    expect(minha.contratosAtivos).toBe(1);
    expect(typeof minha.recebidoNoMes).toBe("number");
    expect(typeof minha.aReceberAberto).toBe("number");
  });

  it("quem não é superadmin não vê a rede (403)", async () => {
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora.get("/api/admin/consolidado").expect(403);
  });
});
