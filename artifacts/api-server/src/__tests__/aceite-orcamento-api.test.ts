import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, orcamentoVersoesTable, auditLogTable, orcamentosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import app from "../app";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  type Fixture,
} from "./helpers";

/**
 * E75 + E74 — versões do orçamento e o aceite digital.
 *
 * Edição sobrescrevia: a noiva olhava um link cujo conteúdo mudava embaixo
 * dela, e "aprovar" era uma conversa sem registro. Agora marcar ENVIADO
 * congela uma versão (itens, desconto, totais, hash) e o aceite pelo link
 * grava instante + versão + hash, aprova o orçamento e deixa linha na trilha
 * — com a noiva como autora, sem sessão.
 */
describe("Versões e aceite do orçamento (E74/E75)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Orçamento RASCUNHO com um item e link público válido. */
  async function orcamentoComLink() {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 3000, quantidade: 1 });
    const link = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`)
      .expect(200);
    return { orcamento, lead, token: link.body.token as string };
  }

  it("gerar o link (que É enviar) congela a versão 1 — e reenviar o mesmo status não duplica", async () => {
    const { orcamento } = await orcamentoComLink();

    // PATCH ENVIADO→ENVIADO é no-op de versão: só a TRANSIÇÃO congela.
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ status: "ENVIADO" })
      .expect(200);

    const versoes = await db
      .select()
      .from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id));
    expect(versoes).toHaveLength(1);
    expect(versoes[0].numero).toBe(1);
    expect(versoes[0].totalLiquido).toBe(3000);
    expect(versoes[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a noiva aceita pelo link: aprova, grava versão+hash e deixa trilha com ela como autora", async () => {
    const { orcamento, lead, token } = await orcamentoComLink();
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ status: "ENVIADO" })
      .expect(200);

    const publico = request(app);
    const aceite = await publico
      .post(`/api/orcamentos/publico/aceite?token=${token}`)
      .expect(200);
    expect(aceite.body.aceitoEm).toBeTruthy();

    // O GET público vira comprovante e diz a versão.
    const visao = await publico.get(`/api/orcamentos/publico?token=${token}`).expect(200);
    expect(visao.body.status).toBe("APROVADO");
    expect(visao.body.aceitoEm).toBeTruthy();
    expect(visao.body.versaoNumero).toBe(1);

    // Idempotente: o clique duplo devolve o MESMO aceite.
    const segundo = await publico
      .post(`/api/orcamentos/publico/aceite?token=${token}`)
      .expect(200);
    expect(segundo.body.aceitoEm).toBe(aceite.body.aceitoEm);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "ORCAMENTO_ACEITO"),
        eq(auditLogTable.entidadeId, orcamento.id),
      ));
    expect(linha).toBeTruthy();
    expect(linha.usuarioId).toBeNull();
    expect(linha.usuarioNome).toContain(lead.noivaNome);
    expect(linha.detalhe).toMatchObject({ versao: 1 });
  });

  it("rascunho não se aceita (422) — só o que foi ENVIADO", async () => {
    // A máquina não volta ENVIADO→RASCUNHO: monta o cenário direto no banco —
    // um RASCUNHO com token válido (estado que não nasce pela API de hoje,
    // mas a guarda pública não pode depender disso).
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const token = `tok-${orcamento.id}`;
    await db
      .update(orcamentosTable)
      .set({ publicoToken: token, publicoExpiraEm: new Date(Date.now() + 3_600_000) })
      .where(eq(orcamentosTable.id, orcamento.id));
    await request(app).post(`/api/orcamentos/publico/aceite?token=${token}`).expect(422);
  });

  it("token inválido é 404", async () => {
    await request(app).post(`/api/orcamentos/publico/aceite?token=inexistente`).expect(404);
  });

  it("a noiva vê a versão ENVIADA, não o rascunho editado depois", async () => {
    const { orcamento, token } = await orcamentoComLink();
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ status: "ENVIADO" })
      .expect(200);

    // A vendedora mexe no orçamento vivo depois do envio.
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Item novo pós-envio", valorUnitario: 999, quantidade: 1 })
      .expect(201);

    const visao = await request(app).get(`/api/orcamentos/publico?token=${token}`).expect(200);
    expect(visao.body.totalLiquido).toBe(3000);
    expect(visao.body.itens).toHaveLength(1);
  });
});
