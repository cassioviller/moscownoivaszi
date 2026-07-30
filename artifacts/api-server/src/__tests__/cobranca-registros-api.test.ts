import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable, usuariosTable, auditLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * Registros de cobrança — o histórico de contato por noiva.
 *
 * Regressão: a rota fazia `parse()` na linha crua do banco, mas a coluna é
 * `contatoData` e o contrato expõe `data`. Toda leitura com registro e todo
 * POST devolviam 500 — escondidos por um `@ts-ignore` no insert e por nenhum
 * teste cobrir o par. Estes testes existem para o par não voltar a mentir.
 */
describe("Registros de cobrança (API)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadId: string;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    leadId = randomUUID();
    await db.insert(leadsTable).values({ id: leadId, lojaId: f.lojaId, noivaNome: "Noiva Teste" });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("noiva sem contato registrado tem histórico vazio", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`).expect(200);
    expect(res.body).toEqual([]);
  });

  it("registra um contato e o devolve conforme o contrato", async () => {
    const data = "2026-03-10T14:00:00.000Z";
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`)
      .send({ data, canal: "WHATSAPP", observacao: "Falei com a noiva, vai pagar dia 15." })
      .expect(201);

    expect(res.body).toMatchObject({
      leadId,
      data,
      canal: "WHATSAPP",
      observacao: "Falei com a noiva, vai pagar dia 15.",
      // Quem falou vem da sessão de quem chamou.
      vendedorNome: expect.stringContaining("Super Admin Teste"),
    });
    // O contrato exige `id`: sem ele o cliente não consegue chavear a lista.
    expect(typeof res.body.id).toBe("string");
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  it("o histórico lê do contato mais recente para o mais antigo", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`)
      .send({ data: "2026-01-05T10:00:00.000Z", canal: "TELEFONE" })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`)
      .send({ data: "2026-06-20T09:00:00.000Z", canal: "PRESENCIAL" })
      .expect(201);

    const res = await agent.get(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`).expect(200);
    expect(res.body.map((r: { data: string }) => r.data)).toEqual([
      "2026-06-20T09:00:00.000Z",
      "2026-03-10T14:00:00.000Z",
      "2026-01-05T10:00:00.000Z",
    ]);
  });

  it("observação é opcional — nem todo contato rende recado", async () => {
    const outroLead = randomUUID();
    await db.insert(leadsTable).values({ id: outroLead, lojaId: f.lojaId, noivaNome: "Noiva Sem Recado" });
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/leads/${outroLead}/cobrancas`)
      .send({ data: "2026-02-01T12:00:00.000Z", canal: "OUTRO" })
      .expect(201);
    expect(res.body.observacao).toBeNull();
  });

  it("o autor vem da sessão: o cliente não escolhe quem falou com a noiva", async () => {
    // A vendedora tenta atribuir o contato ao superadmin. O corpo é ignorado —
    // quem registrou é fato de quem está logado, não do que o cliente declara.
    const daVendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await daVendedora
      .post(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`)
      .send({ data: "2026-05-01T12:00:00.000Z", canal: "TELEFONE", vendedorId: f.superAdminId })
      .expect(201);

    expect(res.body.vendedorNome).toContain("Vendedora Teste");
    expect(res.body.vendedorNome).not.toContain("Super Admin");
  });

  it("o histórico sobrevive à saída da colaboradora: sem autor, mas com o fato", async () => {
    // `vendedorId` é ON DELETE SET NULL — apagar quem ligou não pode apagar que
    // a ligação existiu.
    const efemera = await criarFixture();
    const agente = await loginComLoja(efemera.vendedoraEmail, efemera.lojaId);
    const leadDela = randomUUID();
    await db.insert(leadsTable).values({ id: leadDela, lojaId: efemera.lojaId, noivaNome: "Noiva X" });
    await agente
      .post(`/api/lojas/${efemera.lojaId}/leads/${leadDela}/cobrancas`)
      .send({ data: "2026-04-01T12:00:00.000Z", canal: "PRESENCIAL", observacao: "passou na loja" })
      .expect(201);

    const admin = await loginComLoja(efemera.superAdminEmail, efemera.lojaId);
    await db.delete(usuariosTable).where(eq(usuariosTable.id, efemera.vendedoraId));

    const res = await admin.get(`/api/lojas/${efemera.lojaId}/leads/${leadDela}/cobrancas`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ observacao: "passou na loja", vendedorNome: null });

    await limparFixture(efemera);
  });

  it("canal fora do contrato é 400, não uma linha suja no banco", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`)
      .send({ data: "2026-02-01T12:00:00.000Z", canal: "POMBO_CORREIO" })
      .expect(400);
  });

  it("lead de outra loja é 404 — o histórico não vaza entre lojas", async () => {
    const outra = await criarFixture();
    try {
      const leadDaOutra = randomUUID();
      await db.insert(leadsTable).values({ id: leadDaOutra, lojaId: outra.lojaId, noivaNome: "Noiva Alheia" });
      await agent.get(`/api/lojas/${f.lojaId}/leads/${leadDaOutra}/cobrancas`).expect(404);
      await agent
        .post(`/api/lojas/${f.lojaId}/leads/${leadDaOutra}/cobrancas`)
        .send({ data: "2026-02-01T12:00:00.000Z", canal: "WHATSAPP" })
        .expect(404);
    } finally {
      await limparFixture(outra);
    }
  });

  /**
   * E123/B3 — o desfazer. O registro nasce do clique num link que abre OUTRA
   * ABA (a fila de /mensagens): errar o botão é barato, e sem o DELETE o
   * histórico afirmava um contato que não houve e o relógio do "parado há N
   * dias" zerava em falso. A régua do E91/E106/E111/E115 vale: 404 antes de
   * qualquer escrita, e trilha DENTRO da transação — depois do DELETE ela é o
   * único rastro.
   */
  describe("desfazer (DELETE)", () => {
    async function registrar(observacao: string): Promise<string> {
      const res = await agent
        .post(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`)
        .send({ data: new Date().toISOString(), canal: "WHATSAPP", observacao })
        .expect(201);
      return res.body.id as string;
    }

    it("remove o registro, e o histórico volta ao que era", async () => {
      const antes = await agent.get(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`).expect(200);
      const id = await registrar("clique errado na fila");

      await agent.delete(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas/${id}`).expect(204);

      const depois = await agent.get(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas`).expect(200);
      expect(depois.body).toEqual(antes.body);
    });

    it("deixa rastro na trilha: quem desfez, o que dizia o registro", async () => {
      const id = await registrar("vai pagar dia 15");
      await agent.delete(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas/${id}`).expect(204);

      const trilha = await db
        .select()
        .from(auditLogTable)
        .where(and(
          eq(auditLogTable.lojaId, f.lojaId),
          eq(auditLogTable.acao, "REGISTRO_COBRANCA_DESFEITO"),
          eq(auditLogTable.entidadeId, id),
        ));
      expect(trilha).toHaveLength(1);
      expect(trilha[0]!.usuarioNome).toContain("Super Admin Teste");
      expect(trilha[0]!.detalhe).toMatchObject({
        canal: "WHATSAPP",
        observacao: "vai pagar dia 15",
      });
    });

    it("o segundo desfazer do mesmo registro é 404 — não há o que desfazer", async () => {
      const id = await registrar("desfeito duas vezes");
      await agent.delete(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas/${id}`).expect(204);
      const res = await agent
        .delete(`/api/lojas/${f.lojaId}/leads/${leadId}/cobrancas/${id}`)
        .expect(404);
      expect(res.body.error).toBe("REGISTRO_DE_COBRANCA_NAO_ENCONTRADO");
    });

    it("registro de outra loja é 404 e NADA some — o desfazer não vaza entre lojas", async () => {
      const outra = await criarFixture();
      try {
        const leadDaOutra = randomUUID();
        await db.insert(leadsTable).values({ id: leadDaOutra, lojaId: outra.lojaId, noivaNome: "Noiva Alheia" });
        const agenteDaOutra = await loginComLoja(outra.superAdminEmail, outra.lojaId);
        const res = await agenteDaOutra
          .post(`/api/lojas/${outra.lojaId}/leads/${leadDaOutra}/cobrancas`)
          .send({ data: new Date().toISOString(), canal: "TELEFONE" })
          .expect(201);
        const idDaOutra = res.body.id as string;

        // A loja A tenta desfazer o registro da loja B pelo próprio caminho.
        await agent
          .delete(`/api/lojas/${f.lojaId}/leads/${leadDaOutra}/cobrancas/${idDaOutra}`)
          .expect(404);
        await agenteDaOutra
          .get(`/api/lojas/${outra.lojaId}/leads/${leadDaOutra}/cobrancas`)
          .expect(200)
          .expect((r) => expect(r.body).toHaveLength(1));
      } finally {
        await limparFixture(outra);
      }
    });
  });
});
