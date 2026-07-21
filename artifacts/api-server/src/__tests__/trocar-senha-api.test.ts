import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, usuariosTable, sessoesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import app from "../app";
import { criarFixture, fecharPool, limparFixture, loginComLoja, SENHA_TESTE, type Fixture } from "./helpers";

/**
 * E57 — a senha que o colega escolheu por mim.
 *
 * O cadastro-com-senha chamava o campo de "senha inicial" e nada forçava a
 * troca: quem criou o acesso conhecia a senha da colega para sempre e podia
 * entrar COMO ela — inclusive deixando o nome dela na trilha de auditoria.
 */
describe("Troca de senha forçada (E57)", () => {
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

  /** Membro criado PELO ADMIN, com senha escolhida por ele. */
  async function membroCriadoPeloAdmin(): Promise<{ id: string; email: string }> {
    const sufixo = randomUUID().slice(0, 8);
    const email = `novato-${sufixo}@teste.local`;
    const res = await admin
      .post(`/api/lojas/${f.lojaId}/equipe`)
      .send({ nome: `Novato ${sufixo}`, email, senha: SENHA_TESTE, perfilId: f.perfilId })
      .expect(201);
    return { id: res.body.usuarioId, email };
  }

  const flagDe = async (usuarioId: string) => {
    const [u] = await db
      .select({ precisa: usuariosTable.precisaTrocarSenha })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, usuarioId));
    return u.precisa;
  };

  it("quem recebe senha do admin nasce com a troca pendente", async () => {
    const membro = await membroCriadoPeloAdmin();
    expect(await flagDe(membro.id)).toBe(true);

    // E o /me diz isso — é por ele que a tela sabe travar o resto.
    const agent = await loginComLoja(membro.email, f.lojaId);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.usuario.precisaTrocarSenha).toBe(true);
  });

  it("trocar limpa a pendência e a senha nova passa a valer", async () => {
    const membro = await membroCriadoPeloAdmin();
    const agent = await loginComLoja(membro.email, f.lojaId);
    const novaSenha = "senha-escolhida-por-mim";

    await agent
      .post("/api/auth/senha")
      .send({ senhaAtual: SENHA_TESTE, novaSenha })
      .expect(204);

    expect(await flagDe(membro.id)).toBe(false);

    // A senha antiga morre…
    await request(app)
      .post("/api/auth/login")
      .send({ email: membro.email, senha: SENHA_TESTE })
      .expect(401);
    // …e a nova entra.
    await request(app)
      .post("/api/auth/login")
      .send({ email: membro.email, senha: novaSenha })
      .expect(200);
  });

  it("a troca derruba as OUTRAS sessões — inclusive a de quem sabia a senha", async () => {
    const membro = await membroCriadoPeloAdmin();
    // Duas sessões: a dela e a de quem conhece a senha (o admin entrando como
    // ela). É exatamente o caso que o épico existe para fechar.
    const dela = await loginComLoja(membro.email, f.lojaId);
    const doIntruso = await loginComLoja(membro.email, f.lojaId);
    expect(
      (await db.select().from(sessoesTable).where(eq(sessoesTable.usuarioId, membro.id))).length,
    ).toBe(2);

    await dela
      .post("/api/auth/senha")
      .send({ senhaAtual: SENHA_TESTE, novaSenha: "outra-senha-boa" })
      .expect(204);

    // A sessão do intruso morreu…
    await doIntruso.get("/api/auth/me").expect(401);
    // …e a de quem trocou continua valendo: ser deslogada por se proteger
    // ensinaria a não trocar a senha.
    await dela.get("/api/auth/me").expect(200);
  });

  it("exige a senha atual — sessão sequestrada não vira troca de senha", async () => {
    const membro = await membroCriadoPeloAdmin();
    const agent = await loginComLoja(membro.email, f.lojaId);

    const res = await agent
      .post("/api/auth/senha")
      .send({ senhaAtual: "chute-errado", novaSenha: "qualquer-outra" })
      .expect(422);
    expect(res.body.error).toBe("SENHA_ATUAL_INCORRETA");
    // A recusa não pode ter mexido em nada.
    expect(await flagDe(membro.id)).toBe(true);
  });

  it("recusa repetir a senha atual", async () => {
    const membro = await membroCriadoPeloAdmin();
    const agent = await loginComLoja(membro.email, f.lojaId);

    const res = await agent
      .post("/api/auth/senha")
      .send({ senhaAtual: SENHA_TESTE, novaSenha: SENHA_TESTE })
      .expect(422);
    // Passaria pela validação e não trocaria nada: a pessoa sairia da tela
    // achando que se protegeu.
    expect(res.body.error).toBe("SENHA_REPETIDA");
    expect(await flagDe(membro.id)).toBe(true);
  });

  it("quem escolheu a própria senha não é cobrado", async () => {
    // A fixture cria a vendedora direto no banco, como o aceite de convite faz
    // — sem admin escolhendo senha, sem pendência.
    expect(await flagDe(f.vendedoraId)).toBe(false);
  });

  it("resetar a senha pelo console volta a cobrar a troca", async () => {
    const membro = await membroCriadoPeloAdmin();
    const agent = await loginComLoja(membro.email, f.lojaId);
    await agent.post("/api/auth/senha").send({ senhaAtual: SENHA_TESTE, novaSenha: "minha-senha-1" }).expect(204);
    expect(await flagDe(membro.id)).toBe(false);

    // O superadmin reseta: a senha volta a ser de outra pessoa.
    await admin
      .patch(`/api/admin/usuarios/${membro.id}`)
      .send({ senha: "reset-pelo-admin" })
      .expect(200);
    expect(await flagDe(membro.id)).toBe(true);
  });
});
