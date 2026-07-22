import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, perfisTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E80 — o perfil do sistema é uma FLAG no banco, não um nome. Hoje só a UI
 * protegia o Admin: um curl com PATCH/DELETE derrubava o perfil de acesso
 * total (renome perdia o readonly; permissões a menos trancava a loja).
 * Agora o servidor recusa — a UI é cortesia, a regra mora aqui.
 */
describe("Perfil do sistema (E80)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;
  let perfilSistemaId: string;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
    // Perfil de sistema PRÓPRIO da suíte — não tocar no Admin do seed, que
    // outras suítes usam em paralelo.
    perfilSistemaId = randomUUID();
    await db.insert(perfisTable).values({
      id: perfilSistemaId,
      nome: `Sistema Teste ${perfilSistemaId.slice(0, 8)}`,
      acessosModulos: { admin: true },
      sistema: true,
    });
  });

  afterAll(async () => {
    await db.delete(perfisTable).where(eq(perfisTable.id, perfilSistemaId));
    await limparFixture(f);
    await fecharPool();
  });

  it("a lista expõe a flag: o perfil do sistema chega marcado", async () => {
    const res = await admin.get("/api/admin/perfis").expect(200);
    const sistema = res.body.find((p: { id: string }) => p.id === perfilSistemaId);
    expect(sistema.sistema).toBe(true);
    const comum = res.body.find((p: { id: string }) => p.id === f.perfilId);
    expect(comum.sistema).toBe(false);
  });

  it("PATCH em perfil do sistema é 403 PERFIL_SISTEMA — nem renome passa", async () => {
    const res = await admin
      .patch(`/api/admin/perfis/${perfilSistemaId}`)
      .send({ nome: "Rebatizado" })
      .expect(403);
    expect(res.body.error).toBe("PERFIL_SISTEMA");

    // O banco não mudou.
    const [linha] = await db.select().from(perfisTable).where(eq(perfisTable.id, perfilSistemaId));
    expect(linha.nome).toMatch(/^Sistema Teste/);
  });

  it("DELETE em perfil do sistema é 403; o perfil segue vivo", async () => {
    const res = await admin.delete(`/api/admin/perfis/${perfilSistemaId}`).expect(403);
    expect(res.body.error).toBe("PERFIL_SISTEMA");
    const [linha] = await db.select().from(perfisTable).where(eq(perfisTable.id, perfilSistemaId));
    expect(linha).toBeTruthy();
  });

  it("perfil comum segue editável — a guarda não respinga", async () => {
    const res = await admin
      .patch(`/api/admin/perfis/${f.perfilId}`)
      .send({ nome: `Perfil Renomeado ${f.perfilId.slice(0, 8)}` })
      .expect(200);
    expect(res.body.nome).toMatch(/^Perfil Renomeado/);
    expect(res.body.sistema).toBe(false);
  });
});
