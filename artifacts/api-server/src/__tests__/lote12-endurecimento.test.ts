import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import app from "../app";
import {
  criarFixture,
  criarLead,
  criarContrato,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

describe("Lote 12 — endurecimento para produção", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("helmet: respostas carregam os headers de segurança", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
    // Header do Express não deve vazar a stack.
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("CORS: sem CORS_ORIGINS, origem externa não recebe allow-origin", async () => {
    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://malicioso.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  /**
   * S-O46 (E176) trocou a PERSONA destes dois, não a tese.
   *
   * O que o C18 prega é a GUARDA: contrato vivo segura a ficha (409), e sem
   * contrato ela sai limpa (204). Isso continua inteiro. O que mudou é quem
   * apaga: a rota não declarava ação e derivava `editar` de `leads`, e o E172
   * deu `leads: TUDO` à Recepção para ela corrigir o telefone que digitou —
   * com isso, quem atende o telefone passava a apagar a ficha da noiva, com
   * cascata em atendimento, orçamento, interesse e cobrança. Apagar é ato de
   * ADMINISTRAÇÃO, como anonimizar (o expurgo do E172).
   */
  it("C18: apagar lead com contrato → 409 e o lead permanece", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    await criarContrato(f, { leadId: lead.id, valorTotal: 1000, fechadoEm: dataFutura(0) });

    const res = await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}`).expect(409);
    expect(res.body.error).toBeTruthy();

    const [aindaLa] = await db.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(aindaLa).toBeTruthy();
  });

  it("C18: apagar lead sem contrato continua permitido (204)", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}`).expect(204);

    const [sumiu] = await db.select({ id: leadsTable.id }).from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(sumiu).toBeUndefined();
  });
});
