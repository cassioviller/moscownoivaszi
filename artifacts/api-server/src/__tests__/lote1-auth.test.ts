import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { criarFixture, limparFixture, fecharPool, loginComLoja, SENHA_TESTE, type Fixture } from "./helpers";

let f: Fixture;

beforeAll(async () => {
  f = await criarFixture();
});

afterAll(async () => {
  await limparFixture(f);
  await fecharPool();
});

describe("saúde e formato de erros", () => {
  it("healthz responde 200 sem autenticação", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("login com body inválido responde 400 JSON", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nao-e-email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("login com credencial errada responde 401 JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: f.vendedoraEmail, senha: "senha-errada" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Credenciais inválidas" });
  });

  it("rota /api inexistente responde 404 JSON (não HTML)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await agent.get("/api/rota-que-nao-existe");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Rota não encontrada" });
  });
});

describe("autorização por perfil (regressão C1)", () => {
  it("não autenticado recebe 401 em rota de loja", async () => {
    const res = await request(app).get(`/api/lojas/${f.lojaId}/leads`);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("vendedora (não superadmin) usa módulos comuns da própria loja", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads`);
    expect(res.status).toBe(200);
    // E7: a listagem virou envelope paginado { itens, total }.
    expect(Array.isArray(res.body.itens)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("vendedora não acessa rotas /admin", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await agent.get("/api/admin/lojas");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Acesso negado (SuperAdmin only)" });
  });

  it("superadmin acessa rotas /admin", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: f.superAdminEmail, senha: SENHA_TESTE }).expect(200);
    const res = await agent.get("/api/admin/lojas");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("vendedora não seleciona loja à qual não tem vínculo", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: f.vendedoraEmail, senha: SENHA_TESTE }).expect(200);
    const res = await agent
      .post("/api/auth/selecionar-loja")
      .send({ lojaId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(403);
  });
});
