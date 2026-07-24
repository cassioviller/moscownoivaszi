import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, perfisTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

  it("/auth/me expõe os acessos por módulo × ação da loja ativa", async () => {
    // O `/me` alimenta o menu e os gates do frontend; ele tem que enxergar
    // exatamente as mesmas permissões que o guard das rotas aplica — por isso
    // sai normalizado, e nunca no formato plano antigo.
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.acessosModulos.leads).toEqual({ ver: true, criar: true, editar: true });
    expect(me.body.acessosModulos.financeiro).toEqual({ ver: false, criar: false, editar: false });
  });

  // ── Gate por AÇÃO ──
  // A pergunta que o modelo plano não sabia responder: "vê, mas não mexe".
  it("perfil com apenas `ver` lê o módulo mas não escreve nele", async () => {
    const somenteLeitura = await criarFixture();
    try {
      await db
        .update(perfisTable)
        .set({ acessosModulos: { leads: { ver: true, criar: false, editar: false } } })
        .where(eq(perfisTable.id, somenteLeitura.perfilId));

      const agent = await loginComLoja(somenteLeitura.vendedoraEmail, somenteLeitura.lojaId);

      await agent.get(`/api/lojas/${somenteLeitura.lojaId}/leads`).expect(200);

      const res = await agent
        .post(`/api/lojas/${somenteLeitura.lojaId}/leads`)
        .send({ noivaNome: "Não deveria entrar" })
        .expect(403);
      expect(res.body.error).toBe("ACESSO_NEGADO_MODULO");
      expect(res.body.acao).toBe("criar");
    } finally {
      await limparFixture(somenteLeitura);
    }
  });

  it("perfil com `criar` cria — e a ação vem do método HTTP", async () => {
    const podeCriar = await criarFixture();
    try {
      await db
        .update(perfisTable)
        .set({ acessosModulos: { leads: { ver: true, criar: true, editar: false } } })
        .where(eq(perfisTable.id, podeCriar.perfilId));

      const agent = await loginComLoja(podeCriar.vendedoraEmail, podeCriar.lojaId);
      const criado = await agent
        .post(`/api/lojas/${podeCriar.lojaId}/leads`)
        .send({ noivaNome: "Entra" })
        .expect(201);

      // Criar não é editar: o PATCH ainda bate na porta fechada.
      await agent
        .patch(`/api/lojas/${podeCriar.lojaId}/leads/${criado.body.id}`)
        .send({ noivaNome: "Alterado" })
        .expect(403);
    } finally {
      await limparFixture(podeCriar);
    }
  });

  it("recurso de outra loja não é acessível (escopo multi-tenant)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const vestidoOutra = await criarVestido(outra);
    // lojaId do path = loja da sessão (passa no middleware), mas o vestido é de
    // outra loja → o handler barra por escopo com 404.
    await agent.get(`/api/lojas/${f.lojaId}/vestidos/${vestidoOutra.id}`).expect(404);
  });

  it("cancelar/estornar exigem editar: perfil com só `criar` é negado", async () => {
    const soCriar = await criarFixture();
    try {
      await db
        .update(perfisTable)
        .set({ acessosModulos: { leads: { ver: true, criar: true, editar: false }, financeiro: { ver: true, criar: true, editar: false } } })
        .where(eq(perfisTable.id, soCriar.perfilId));
      const agent = await loginComLoja(soCriar.vendedoraEmail, soCriar.lojaId);

      // O gate roda ANTES do handler: nem precisa existir contrato/parcela real.
      // Antes, POST derivava `criar` e passava; agora deriva `editar` e barra.
      const c1 = await agent.post(`/api/lojas/${soCriar.lojaId}/contratos/qualquer/cancelar`).send({}).expect(403);
      expect(c1.body.acao).toBe("editar");
      const c2 = await agent.post(`/api/lojas/${soCriar.lojaId}/parcelas/qualquer/estornar`).send({}).expect(403);
      expect(c2.body.acao).toBe("editar");
      await agent.post(`/api/lojas/${soCriar.lojaId}/financeiro/pagamentos/qualquer/estornar`).send({}).expect(403);
    } finally {
      await limparFixture(soCriar);
    }
  });
});
