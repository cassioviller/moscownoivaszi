import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

// O perfil da fixture concede { leads, vestidos, agenda } e NÃO concede
// financeiro nem comissao — base para a matriz de acesso.
describe("Lote 7 — escopo de loja + permissões por módulo", () => {
  let f: Fixture;
  let outra: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
    outra = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await limparFixture(outra);
    await fecharPool();
  });

  it("vendedora sem o módulo financeiro recebe 403", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await agent.get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`).expect(403);
    expect(res.body.error).toBe("ACESSO_NEGADO_MODULO");
    expect(res.body.modulo).toBe("financeiro");
  });

  it("vendedora sem o módulo comissao recebe 403", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await agent.get(`/api/lojas/${f.lojaId}/comissao/regras`).expect(403);
    expect(res.body.error).toBe("ACESSO_NEGADO_MODULO");
  });

  it("vendedora acessa os módulos concedidos (leads)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await agent.get(`/api/lojas/${f.lojaId}/leads`).expect(200);
  });

  it("superadmin ignora o gate de módulo", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    await agent.get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`).expect(200);
  });

  it("rota inexistente ainda responde 404 (gate não vaza)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await agent.get(`/api/lojas/${f.lojaId}/rota-que-nao-existe`).expect(404);
  });

  it("/auth/me expõe os acessos de módulo da loja ativa", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.acessosModulos.leads).toBe(true);
    expect(me.body.acessosModulos.financeiro).not.toBe(true);
  });

  it("recurso de outra loja não é acessível (escopo multi-tenant)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const vestidoOutra = await criarVestido(outra);
    // lojaId do path = loja da sessão (passa no middleware), mas o vestido é de
    // outra loja → o handler barra por escopo com 404.
    await agent.get(`/api/lojas/${f.lojaId}/vestidos/${vestidoOutra.id}`).expect(404);
  });
});
