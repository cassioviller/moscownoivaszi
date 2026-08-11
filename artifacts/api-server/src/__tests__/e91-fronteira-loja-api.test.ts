import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { db, usuariosTable, contratosTable, sessoesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarFixture,
  criarLead,
  criarContrato,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";

/**
 * E91 — a fronteira da loja: nenhum id entra sem prova de pertencimento.
 *
 * Duas fixtures, agente da loja A, ids da loja B. Antes deste épico:
 *
 * - B1 🔴 `PATCH /lojas/A/equipe/<id-da-dona-de-B>` com `{"ativo": false}`
 *   escrevia na tabela GLOBAL `usuarios` pelo id do path. A dona de B era
 *   derrubada (login recusado, sessões encerradas) por um tenant vizinho, e o
 *   404 saía DEPOIS do commit — cosmético.
 * - B4 🟠 contrato com `vendedoraId` de B e orçamento com `leadId` de B eram
 *   aceitos: o GET enriquecido devolvia a ficha da noiva e o e-mail da
 *   vendedora da outra loja para dentro de A.
 * - B2 🔴 `DELETE /admin/usuarios/:id` cascateava contratos e parcelas PAGAS.
 * - B12 🟡 resetar a senha pelo console não derrubava a sessão viva.
 */
describe("E91 — fronteira da loja (API)", () => {
  let A: Fixture;
  let B: Fixture;
  let adminA: Awaited<ReturnType<typeof loginComLoja>>;
  let leadA: string;
  let leadB: string;

  beforeAll(async () => {
    A = await criarFixture();
    B = await criarFixture();
    adminA = await loginComLoja(A.superAdminEmail, A.lojaId);
    leadA = (await criarLead(A)).id;
    leadB = (await criarLead(B)).id;
  });

  afterAll(async () => {
    await limparFixture(A);
    await limparFixture(B);
    await fecharPool();
  });

  // ───────────────────────── B1 🔴 ─────────────────────────

  it("PATCH /equipe com usuário de OUTRA loja é 404 — e a vítima continua ativa", async () => {
    await adminA
      .patch(`/api/lojas/${A.lojaId}/equipe/${B.vendedoraId}`)
      .send({ ativo: false, nome: "Renomeada pelo vizinho" })
      .expect(404);

    const [vitima] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, B.vendedoraId));
    expect(vitima.ativo).toBe(true);
    expect(vitima.nome).not.toBe("Renomeada pelo vizinho");
  });

  it("PATCH /equipe com usuário de outra loja NÃO derruba as sessões dele", async () => {
    const agenteB = await loginComLoja(B.vendedoraEmail, B.lojaId);
    await adminA
      .patch(`/api/lojas/${A.lojaId}/equipe/${B.vendedoraId}`)
      .send({ ativo: false })
      .expect(404);
    // A sessão da loja B segue viva: nada foi escrito por conta do vizinho.
    await agenteB.get("/api/auth/me").expect(200);
  });

  it("DELETE /equipe com usuário de outra loja é 404 (antes: 204 sem remover nada)", async () => {
    const agenteB = await loginComLoja(B.vendedoraEmail, B.lojaId);
    await adminA.delete(`/api/lojas/${A.lojaId}/equipe/${B.vendedoraId}`).expect(404);
    // O DoS de sessão do B1: o `encerrarSessoesDoUsuario` rodava mesmo assim.
    await agenteB.get("/api/auth/me").expect(200);
  });

  it("PATCH /equipe com usuário da PRÓPRIA loja continua funcionando", async () => {
    await adminA
      .patch(`/api/lojas/${A.lojaId}/equipe/${A.vendedoraId}`)
      .send({ nome: "Vendedora Renomeada" })
      .expect(200);
    const [alvo] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, A.vendedoraId));
    expect(alvo.nome).toBe("Vendedora Renomeada");
  });

  // ───────────────────────── B4 🟠 ─────────────────────────

  it("POST /contratos com vendedora de OUTRA loja é 422", async () => {
    const r = await adminA
      .post(`/api/lojas/${A.lojaId}/contratos`)
      .send({ leadId: leadA, vendedoraId: B.vendedoraId, valorTotal: 5000 })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");
  });

  it("POST /contratos com vendedora da própria loja passa (201)", async () => {
    await adminA
      .post(`/api/lojas/${A.lojaId}/contratos`)
      .send({ leadId: leadA, vendedoraId: A.vendedoraId, valorTotal: 5000 })
      .expect(201);
  });

  it("POST /orcamentos com lead de OUTRA loja é 422", async () => {
    const r = await adminA
      .post(`/api/lojas/${A.lojaId}/orcamentos`)
      .send({ leadId: leadB })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");
  });

  it("POST /orcamentos com lead da própria loja passa (201)", async () => {
    await adminA.post(`/api/lojas/${A.lojaId}/orcamentos`).send({ leadId: leadA }).expect(201);
  });

  it("POST /contas-pagar com colaborador de OUTRA loja é 422", async () => {
    const r = await adminA
      .post(`/api/lojas/${A.lojaId}/financeiro/contas-pagar`)
      .send({
        tipo: "SALARIO",
        colaboradorId: B.vendedoraId,
        descricao: "Salário do vizinho",
        valorPrevisto: 3000,
        vencimento: dataFutura(10).toISOString(),
      })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");
  });

  it("POST /recorrencias SALARIO com colaborador de OUTRA loja é 422", async () => {
    const r = await adminA
      .post(`/api/lojas/${A.lojaId}/financeiro/recorrencias`)
      .send({ tipo: "SALARIO", usuarioId: B.vendedoraId, valor: 3000, diaVencimento: 5 })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");
  });

  // ───────────────────────── B2 🔴 ─────────────────────────

  it("DELETE /admin/usuarios de quem tem contrato é 409 — e o contrato continua lá", async () => {
    // E158: noiva PRÓPRIA, e não o `leadA` compartilhado. A partir do índice
    // `contratos_lead_ativo_unico` uma noiva tem no máximo um contrato ATIVO —
    // e o `leadA` já ganhou o dele num teste acima. O que este caso precisa é
    // de UM contrato da vendedora de A; de quem ele é não importa.
    const dona = await criarLead(A);
    const contrato = await criarContrato(A, {
      leadId: dona.id,
      valorTotal: 8000,
      fechadoEm: new Date("2026-01-10T12:00:00-03:00"),
    });

    const r = await adminA.delete(`/api/admin/usuarios/${A.vendedoraId}`).expect(409);
    expect(r.body.error).toBe("USUARIO_COM_HISTORICO");
    expect(r.body.detalhe).toMatch(/[Ii]native/);

    const [ainda] = await db.select().from(contratosTable).where(eq(contratosTable.id, contrato.id));
    expect(ainda).toBeTruthy();
    const [pessoa] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, A.vendedoraId));
    expect(pessoa).toBeTruthy();
  });

  it("DELETE /admin/usuarios de quem NÃO tem histórico continua excluindo", async () => {
    const id = randomUUID();
    await db.insert(usuariosTable).values({
      id,
      nome: "Sem Histórico",
      email: `sem-historico-${id.slice(0, 8)}@teste.local`,
      senhaHash: "x",
    });
    await adminA.delete(`/api/admin/usuarios/${id}`).expect(204);
    const [sumiu] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id));
    expect(sumiu).toBeUndefined();
  });

  // ───────────────────────── B12 🟡 ─────────────────────────

  it("resetar a senha pelo console DERRUBA a sessão viva da pessoa", async () => {
    const agenteB = await loginComLoja(B.vendedoraEmail, B.lojaId);
    await agenteB.get("/api/auth/me").expect(200);

    const adminB = await loginComLoja(B.superAdminEmail, B.lojaId);
    await adminB
      .patch(`/api/admin/usuarios/${B.vendedoraId}`)
      .send({ senha: "outra-senha-999" })
      .expect(200);

    await agenteB.get("/api/auth/me").expect(401);
    const vivas = await db.select().from(sessoesTable).where(eq(sessoesTable.usuarioId, B.vendedoraId));
    expect(vivas.length).toBe(0);

    // A senha nova é a que vale — o reset não quebrou o login.
    await request(app)
      .post("/api/auth/login")
      .send({ email: B.vendedoraEmail, senha: "outra-senha-999" })
      .expect(200);
  });

  it("inativar pelo console também derruba a sessão viva", async () => {
    const alvoId = randomUUID();
    const email = `inativavel-${alvoId.slice(0, 8)}@teste.local`;
    const { hashSenha } = await import("../lib/auth");
    await db.insert(usuariosTable).values({
      id: alvoId,
      nome: "Alvo Inativável",
      email,
      senhaHash: await hashSenha(SENHA_TESTE),
    });
    const agente = request.agent(app);
    await agente.post("/api/auth/login").send({ email, senha: SENHA_TESTE }).expect(200);

    await adminA.patch(`/api/admin/usuarios/${alvoId}`).send({ ativo: false }).expect(200);
    await agente.get("/api/auth/me").expect(401);

    await db.delete(usuariosTable).where(eq(usuariosTable.id, alvoId));
  });
});
