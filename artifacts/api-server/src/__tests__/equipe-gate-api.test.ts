import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * Gate de módulo nas rotas de equipe.
 *
 * Regressão de segurança: o router só montava `requireSessaoComLoja`, sem
 * `requireModulo`. Qualquer usuária com loja ativa criava logins, trocava o
 * próprio perfil para admin ou apagava colegas — escalonamento de privilégio.
 * A tela já gateia por `admin:editar`; o servidor não gateava nada.
 *
 * A fixture dá à vendedora um perfil com {leads, vestidos, agenda} e SEM admin.
 */
describe("Equipe — gate de módulo admin (API)", () => {
  let f: Fixture;
  let vendedora: Awaited<ReturnType<typeof loginComLoja>>;
  let superadmin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    superadmin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("vendedora sem admin NÃO cria membro — 403, não 201", async () => {
    await vendedora
      .post(`/api/lojas/${f.lojaId}/equipe`)
      .send({ nome: "Intrusa", email: `intrusa-${randomUUID()}@x.local`, senha: "12345678", perfilId: f.perfilId })
      .expect(403);
  });

  it("vendedora sem admin NÃO se auto-promove trocando o próprio perfil", async () => {
    await vendedora
      .patch(`/api/lojas/${f.lojaId}/equipe/${f.vendedoraId}`)
      .send({ perfilId: f.perfilId })
      .expect(403);
  });

  it("vendedora sem admin NÃO remove colega", async () => {
    await vendedora.delete(`/api/lojas/${f.lojaId}/equipe/${f.superAdminId}`).expect(403);
  });

  it("superadmin gere a equipe normalmente", async () => {
    const email = `nova-${randomUUID()}@x.local`;
    await superadmin
      .post(`/api/lojas/${f.lojaId}/equipe`)
      .send({ nome: "Nova Colaboradora", email, senha: "12345678", perfilId: f.perfilId })
      .expect(201);
    await superadmin.get(`/api/lojas/${f.lojaId}/equipe`).expect(200);
  });
});
