import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { db, convitesTable, perfisTable, usuariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";

/**
 * Convite por link (E6): o admin manda o link pelo WhatsApp e a própria
 * pessoa define a senha — em vez de o admin digitar a senha do colega.
 * Regras que valem segurança: gate admin, uso único (claim transacional),
 * expiração, e-mail mascarado no público, conta existente NÃO ganha sessão.
 */

describe("Equipe — convites por link", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    ag = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    // Usuários criados por aceite não pertencem à fixture — varre por sufixo.
    await db.delete(usuariosTable).where(eq(usuariosTable.email, "nova.colega@teste.local"));
    await limparFixture(f);
    await fecharPool();
  });

  const base = () => `/api/lojas/${f.lojaId}/equipe/convites`;

  it("criar → listar → o token é a capability (43 chars) e vale ~7 dias", async () => {
    const criado = await ag
      .post(base())
      .send({ nome: "Nova Colega", email: "Nova.Colega@teste.local", perfilId: f.perfilId })
      .expect(201);
    expect(criado.body.token).toHaveLength(43);
    expect(criado.body.email).toBe("nova.colega@teste.local"); // normalizado
    const dias = (new Date(criado.body.expiraEm).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);

    const lista = await ag.get(base()).expect(200);
    expect(lista.body.map((c: { id: string }) => c.id)).toContain(criado.body.id);
    expect(lista.body[0].perfilNome).toContain("Perfil Teste");
  });

  it("segundo convite pendente do mesmo e-mail → 409 CONVITE_PENDENTE", async () => {
    const res = await ag
      .post(base())
      .send({ nome: "Nova Colega", email: "nova.colega@teste.local", perfilId: f.perfilId })
      .expect(409);
    expect(res.body.error).toBe("CONVITE_PENDENTE");
  });

  it("convidar quem já é membro da loja → 409 CONVIDADO_JA_E_MEMBRO", async () => {
    const res = await ag
      .post(base())
      .send({ nome: "Vendedora", email: f.vendedoraEmail, perfilId: f.perfilId })
      .expect(409);
    expect(res.body.error).toBe("CONVIDADO_JA_E_MEMBRO");
  });

  it("gate: vendedora sem admin leva 403 em criar/listar/reenviar/cancelar", async () => {
    const vend = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vend.get(base()).expect(403);
    await vend.post(base()).send({ nome: "X", email: "x@teste.local", perfilId: f.perfilId }).expect(403);
    await vend.post(`${base()}/qualquer/reenviar`).expect(403);
    await vend.delete(`${base()}/qualquer`).expect(403);
  });

  it("info pública: e-mail mascarado, nunca inteiro; token desconhecido → 404", async () => {
    const [convite] = await db.select().from(convitesTable).where(eq(convitesTable.lojaId, f.lojaId));
    const info = await request(app)
      .get("/api/equipe/convites/info")
      .query({ token: convite.token })
      .expect(200);
    expect(info.body).toMatchObject({ nome: "Nova Colega", precisaSenha: true });
    expect(info.body.lojaNome).toContain("Loja Teste");
    expect(info.body.emailMascarado).toBe("n•••a@teste.local");
    expect(JSON.stringify(info.body)).not.toContain("nova.colega@");

    await request(app).get("/api/equipe/convites/info").query({ token: "nao-existe" }).expect(404);
  });

  it("aceite sem senha (e-mail novo) → 422; aceite feliz cria conta, vincula, LOGA e é uso único", async () => {
    const [convite] = await db.select().from(convitesTable).where(eq(convitesTable.lojaId, f.lojaId));

    const semSenha = await request(app)
      .post("/api/equipe/convites/aceitar")
      .send({ token: convite.token })
      .expect(422);
    expect(semSenha.body.error).toBe("SENHA_OBRIGATORIA");

    // Agent próprio: o aceite deve SETAR o cookie de sessão.
    const nova = request.agent(app);
    const aceite = await nova
      .post("/api/equipe/convites/aceitar")
      .send({ token: convite.token, senha: "senha-nova-123" })
      .expect(200);
    expect(aceite.body.jaTinhaConta).toBe(false);
    expect(aceite.headers["set-cookie"]?.[0]).toContain("moscow_sessao");

    // Já logada: /auth/me responde com a conta recém-criada.
    const me = await nova.get("/api/auth/me").expect(200);
    expect(me.body.usuario.email).toBe("nova.colega@teste.local");

    // A senha definida no aceite funciona no login normal.
    await request(app)
      .post("/api/auth/login")
      .send({ email: "nova.colega@teste.local", senha: "senha-nova-123" })
      .expect(200);

    // Membro na equipe; convite fora dos pendentes; segundo aceite → 410.
    const equipe = await ag.get(`/api/lojas/${f.lojaId}/equipe`).expect(200);
    expect(equipe.body.map((m: { email: string }) => m.email)).toContain("nova.colega@teste.local");
    const pendentes = await ag.get(base()).expect(200);
    expect(pendentes.body).toEqual([]);
    const deNovo = await request(app)
      .post("/api/equipe/convites/aceitar")
      .send({ token: convite.token, senha: "outra-senha-9" })
      .expect(410);
    expect(deNovo.body.error).toBe("CONVITE_UTILIZADO");
  });

  it("e-mail com conta existente: aceite vira vínculo puro, SEM sessão, e a senha antiga segue valendo", async () => {
    const outra = await criarFixture();
    try {
      // Convida a vendedora da OUTRA loja para a loja f.
      const criado = await ag
        .post(base())
        .send({ nome: outra.vendedoraEmail, email: outra.vendedoraEmail, perfilId: f.perfilId })
        .expect(201);

      const info = await request(app)
        .get("/api/equipe/convites/info")
        .query({ token: criado.body.token })
        .expect(200);
      expect(info.body.precisaSenha).toBe(false);

      const aceite = await request(app)
        .post("/api/equipe/convites/aceitar")
        .send({ token: criado.body.token, senha: "ignorada-123" })
        .expect(200);
      expect(aceite.body.jaTinhaConta).toBe(true);
      // O portador do link não provou ser o dono da conta: NADA de cookie.
      expect(aceite.headers["set-cookie"]).toBeUndefined();

      // Vinculada à loja f, e a senha ANTIGA continua logando (a enviada foi ignorada).
      const equipe = await ag.get(`/api/lojas/${f.lojaId}/equipe`).expect(200);
      expect(equipe.body.map((m: { email: string }) => m.email)).toContain(outra.vendedoraEmail);
      await request(app)
        .post("/api/auth/login")
        .send({ email: outra.vendedoraEmail, senha: SENHA_TESTE })
        .expect(200);
    } finally {
      await limparFixture(outra);
    }
  });

  it("conta existente INATIVA → 409 CONTA_INATIVA, sem vínculo silencioso", async () => {
    const outra = await criarFixture();
    try {
      await db.update(usuariosTable).set({ ativo: false }).where(eq(usuariosTable.id, outra.vendedoraId));
      const criado = await ag
        .post(base())
        .send({ nome: "Inativa", email: outra.vendedoraEmail, perfilId: f.perfilId })
        .expect(201);
      const res = await request(app)
        .post("/api/equipe/convites/aceitar")
        .send({ token: criado.body.token })
        .expect(409);
      expect(res.body.error).toBe("CONTA_INATIVA");
      // Limpa o convite para não sujar os pendentes de f.
      await ag.delete(`${base()}/${criado.body.id}`).expect(204);
    } finally {
      await limparFixture(outra);
    }
  });

  it("expirado → 410 no info e no aceite (plantado por insert direto)", async () => {
    const token = `expirado-${randomUUID()}`;
    await db.insert(convitesTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      token,
      nome: "Atrasada",
      email: `atrasada-${randomUUID().slice(0, 8)}@teste.local`,
      perfilId: f.perfilId,
      expiraEm: new Date(Date.now() - 1000),
    });
    const info = await request(app).get("/api/equipe/convites/info").query({ token }).expect(410);
    expect(info.body.error).toBe("CONVITE_EXPIRADO");
    await request(app)
      .post("/api/equipe/convites/aceitar")
      .send({ token, senha: "tanto-faz-123" })
      .expect(410);
  });

  it("reenviar regenera o token (o antigo morre) e renova a validade; cancelar mata o convite", async () => {
    const criado = await ag
      .post(base())
      .send({ nome: "Renovada", email: `renovada-${randomUUID().slice(0, 8)}@teste.local`, perfilId: f.perfilId })
      .expect(201);

    const renovado = await ag.post(`${base()}/${criado.body.id}/reenviar`).expect(200);
    expect(renovado.body.token).not.toBe(criado.body.token);
    await request(app).get("/api/equipe/convites/info").query({ token: criado.body.token }).expect(404);
    await request(app).get("/api/equipe/convites/info").query({ token: renovado.body.token }).expect(200);

    await ag.delete(`${base()}/${criado.body.id}`).expect(204);
    await request(app).get("/api/equipe/convites/info").query({ token: renovado.body.token }).expect(404);
  });

  it("escopo: admin de outra loja não reenvia nem cancela convite desta (404)", async () => {
    const outra = await criarFixture();
    try {
      const criado = await ag
        .post(base())
        .send({ nome: "Da Loja F", email: `escopo-${randomUUID().slice(0, 8)}@teste.local`, perfilId: f.perfilId })
        .expect(201);
      const agOutra = await loginComLoja(outra.superAdminEmail, outra.lojaId);
      await agOutra
        .post(`/api/lojas/${outra.lojaId}/equipe/convites/${criado.body.id}/reenviar`)
        .expect(404);
      await agOutra
        .delete(`/api/lojas/${outra.lojaId}/equipe/convites/${criado.body.id}`)
        .expect(404);
      await ag.delete(`${base()}/${criado.body.id}`).expect(204);
    } finally {
      await limparFixture(outra);
    }
  });
});
