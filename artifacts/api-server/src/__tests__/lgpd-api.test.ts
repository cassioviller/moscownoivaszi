import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable, lojasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../app";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  type Fixture,
} from "./helpers";

/**
 * E77 — LGPD interno: consentimento carimbado, expurgo que preserva números
 * e o direito de acesso num download.
 */
describe("LGPD (E77)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    // E172: o expurgo passou de `leads.editar` para `admin` — a tela já o
    // escondia sob `admin.ver` (`configuracoes/index.tsx:51`) e quem divergia
    // era a porta. A vendedora da fixture não tem `admin`, e não deve ter: quem
    // anonimiza a carteira de leads perdidos é quem administra a loja.
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("a captação carimba o consentimento quando a noiva marca", async () => {
    const token = randomUUID();
    await db.update(lojasTable).set({ captacaoToken: token }).where(eq(lojasTable.id, f.lojaId));

    const criado = await request(app)
      .post(`/api/captacao/leads?token=${token}`)
      .send({ noivaNome: "Noiva Consentida", consentimento: true })
      .expect(201);
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, criado.body.id));
    expect(lead.consentimentoEm).not.toBeNull();

    const semConsentimento = await request(app)
      .post(`/api/captacao/leads?token=${token}`)
      .send({ noivaNome: "Noiva Sem Checkbox" })
      .expect(201);
    const [lead2] = await db.select().from(leadsTable).where(eq(leadsTable.id, semConsentimento.body.id));
    expect(lead2.consentimentoEm).toBeNull();
  });

  it("o expurgo anonimiza só as perdidas ANTIGAS — a linha fica, a PII sai", async () => {
    const antiga = await criarLead(f);
    const recente = await criarLead(f);
    const tresAnosAtras = new Date();
    tresAnosAtras.setFullYear(tresAnosAtras.getFullYear() - 3);
    await db.update(leadsTable)
      .set({ etapa: "PERDIDO", perdidaEm: tresAnosAtras, whatsapp: "(11) 98888-7777" })
      .where(eq(leadsTable.id, antiga.id));
    await db.update(leadsTable)
      .set({ etapa: "PERDIDO", perdidaEm: new Date() })
      .where(eq(leadsTable.id, recente.id));

    const r = await agent.post(`/api/lojas/${f.lojaId}/leads/expurgo`).send({}).expect(200);
    expect(r.body.anonimizadas).toBe(1);

    const [dep] = await db.select().from(leadsTable).where(eq(leadsTable.id, antiga.id));
    expect(dep.noivaNome).toBe("(anonimizada)");
    expect(dep.whatsapp).toBeNull();
    expect(dep.etapa).toBe("PERDIDO");
    expect(dep.anonimizadaEm).not.toBeNull();

    const [rec] = await db.select().from(leadsTable).where(eq(leadsTable.id, recente.id));
    expect(rec.noivaNome).not.toBe("(anonimizada)");

    // Idempotente: rodar de novo não encontra mais nada.
    const r2 = await agent.post(`/api/lojas/${f.lojaId}/leads/expurgo`).send({}).expect(200);
    expect(r2.body.anonimizadas).toBe(0);
  });

  it("exportar devolve o retrato da noiva como download", async () => {
    const lead = await criarLead(f);
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/leads/${lead.id}/exportar`)
      .expect(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.lead.id).toBe(lead.id);
    expect(Array.isArray(res.body.orcamentos)).toBe(true);
    expect(Array.isArray(res.body.contratos)).toBe(true);
    expect(Array.isArray(res.body.contatosRegistrados)).toBe(true);
  });
});
