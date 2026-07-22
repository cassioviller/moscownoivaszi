import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, auditLogTable, sessoesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * E60 — o caminho de volta do override.
 *
 * Uma vez personalizado, o perfil ficava preso: a matriz salvava override em
 * cima de override e não havia como dizer "esquece, volta ao modelo global".
 * Remover o override é mudança de permissão como qualquer outra (E56): as
 * sessões de quem tem o perfil na loja caem e a trilha ganha linha.
 */
describe("Restaurar padrão de permissões (E60)", () => {
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

  const sessoesDaVendedora = () =>
    db.select().from(sessoesTable).where(eq(sessoesTable.usuarioId, f.vendedoraId));

  it("remove o override, derruba as sessões do perfil e deixa rastro", async () => {
    await admin
      .put(`/api/admin/lojas/${f.lojaId}/overrides`)
      .send({
        perfilId: f.perfilId,
        acessosModulos: { leads: { ver: true, criar: false, editar: false } },
      })
      .expect(200);

    // A vendedora tem o perfil personalizado e uma sessão viva.
    await loginComLoja(f.vendedoraEmail, f.lojaId);
    expect((await sessoesDaVendedora()).length).toBeGreaterThan(0);

    await admin
      .delete(`/api/admin/lojas/${f.lojaId}/overrides/${f.perfilId}`)
      .expect(204);

    // O override sumiu da lista — o perfil volta ao modelo global.
    const lista = await admin.get(`/api/admin/lojas/${f.lojaId}/overrides`).expect(200);
    expect(lista.body.find((o: { perfilId: string }) => o.perfilId === f.perfilId)).toBeUndefined();

    // Permissão mudou → sessão cai (E56): o acesso novo vale na hora.
    expect(await sessoesDaVendedora()).toHaveLength(0);

    const linhas = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "PERMISSOES_RESTAURADAS"),
      ));
    expect(linhas.length).toBe(1);
    expect(linhas[0].entidade).toBe("perfil");
    expect(linhas[0].entidadeId).toBe(f.perfilId);
  });

  it("perfil sem personalização responde 404 — nada a restaurar", async () => {
    await admin
      .delete(`/api/admin/lojas/${f.lojaId}/overrides/${f.perfilId}`)
      .expect(404);
  });

  it("quem não é superadmin não restaura (403)", async () => {
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora
      .delete(`/api/admin/lojas/${f.lojaId}/overrides/${f.perfilId}`)
      .expect(403);
  });
});
