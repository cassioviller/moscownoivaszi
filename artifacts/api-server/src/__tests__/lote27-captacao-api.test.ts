import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Captação externa (E19): o formulário do site cria o lead sem sessão, com o
 * token da loja como credencial. Regras que valem segurança: token em query
 * (nunca em path logável), gate admin na gestão, rotacionar mata o antigo,
 * e o lead nasce NOVO com a origem marcada.
 */

describe("Leads — captação externa (E19)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const gerarToken = () => admin.post(`/api/lojas/${f.lojaId}/captacao/token`);
  const captar = (token: string, corpo: Record<string, unknown>) =>
    request(app).post(`/api/captacao/leads?token=${token}`).send(corpo);

  it("sem token gerado, captação está desligada (GET devolve null; POST público 404)", async () => {
    const res = await admin.get(`/api/lojas/${f.lojaId}/captacao/token`).expect(200);
    expect(res.body.token).toBeNull();
    await captar("token-inexistente", { noivaNome: "Noiva Site" }).expect(404);
  });

  it("gate: vendedora sem admin não vê nem rotaciona o token", async () => {
    const vend = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vend.get(`/api/lojas/${f.lojaId}/captacao/token`).expect(403);
    await vend.post(`/api/lojas/${f.lojaId}/captacao/token`).expect(403);
  });

  it("com o token, o formulário cria o lead NOVO com origem e sem sessão", async () => {
    const { body: gerado } = await gerarToken().expect(200);
    expect(gerado.token).toHaveLength(43);

    const res = await captar(gerado.token, {
      noivaNome: "  Noiva do Site  ",
      whatsapp: "11 98888-7777",
      origem: "INSTAGRAM",
    }).expect(201);

    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, res.body.id));
    expect(lead.lojaId).toBe(f.lojaId);
    expect(lead.etapa).toBe("NOVO");
    expect(lead.origem).toBe("INSTAGRAM");
    expect(lead.noivaNome).toBe("Noiva do Site"); // trim
  });

  it("origem default é SITE; corpo sem noivaNome é 400", async () => {
    const { body: gerado } = await gerarToken().expect(200);
    const res = await captar(gerado.token, { noivaNome: "Sem Origem" }).expect(201);
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, res.body.id));
    expect(lead.origem).toBe("SITE");

    await captar(gerado.token, { whatsapp: "11 90000-0000" }).expect(400);
  });

  it("rotacionar mata o token antigo na hora", async () => {
    const { body: antigo } = await gerarToken().expect(200);
    const { body: novo } = await gerarToken().expect(200);
    expect(novo.token).not.toBe(antigo.token);

    await captar(antigo.token, { noivaNome: "Chegou Tarde" }).expect(404);
    await captar(novo.token, { noivaNome: "Chegou Bem" }).expect(201);
  });
});
