import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  parcelasTable,
  atendimentosTable,
  cabinesTable,
  lookbooksTable,
  lookbookItensTable,
  auditLogTable,
  orcamentosTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../app";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  criarVestido,
  criarOrcamento,
  criarOrcamentoItem,
  criarContrato,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E78 — o portal da noiva: um token por NOIVA abre proposta, lookbook, provas
 * e extrato. Os invariantes da proposta viram asserção: as seções são
 * coerentes com a fixture; parcelas de OUTRA noiva jamais aparecem; o aceite
 * pelo portal grava o MESMO rastro do E74; regenerar mata o link antigo;
 * revogado responde como desconhecido (404 — o link morto de propósito não
 * conta que um dia valeu).
 */
describe("Portal da noiva (E78)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadA: { id: string; noivaNome: string };
  let orcamentoId: string;
  let token: string;

  const publico = () => request(app);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);

    leadA = await criarLead(f);
    const leadB = await criarLead(f);

    // A proposta ENVIADA da noiva A (o vivo, sem versão — caminho E13).
    const orcamento = await criarOrcamento(f, { leadId: leadA.id, status: "ENVIADO" });
    orcamentoId = orcamento.id;
    await criarOrcamentoItem(f, { orcamentoId, valorUnitario: 4000, quantidade: 1 });

    // O lookbook dela, com um vestido.
    const vestido = await criarVestido(f);
    const lookbookId = randomUUID();
    await db.insert(lookbooksTable).values({
      id: lookbookId,
      lojaId: f.lojaId,
      leadId: leadA.id,
      token: randomUUID(),
      expiraEm: dataFutura(30),
    });
    await db.insert(lookbookItensTable).values({
      id: randomUUID(),
      lookbookId,
      vestidoId: vestido.id,
      ordem: 0,
    });

    // Uma prova futura.
    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine E78" });
    await db.insert(atendimentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: leadA.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      inicio: dataFutura(14),
    });

    // Contratos e parcelas das DUAS noivas — o teste de vazamento.
    const contratoA = await criarContrato(f, { leadId: leadA.id, valorTotal: 4000, fechadoEm: new Date() });
    const contratoB = await criarContrato(f, { leadId: leadB.id, valorTotal: 9999, fechadoEm: new Date() });
    await db.insert(parcelasTable).values([
      {
        id: randomUUID(), lojaId: f.lojaId, contratoId: contratoA.id,
        numero: 1, valorPrevisto: 2000, vencimento: dataFutura(10), status: "PREVISTA",
      },
      {
        id: randomUUID(), lojaId: f.lojaId, contratoId: contratoA.id,
        numero: 2, valorPrevisto: 2000, vencimento: dataFutura(40), status: "PREVISTA",
      },
      {
        id: randomUUID(), lojaId: f.lojaId, contratoId: contratoB.id,
        numero: 1, valorPrevisto: 9999, vencimento: dataFutura(10), status: "PREVISTA",
      },
    ]);

    // O link, gerado pela rota autenticada (gate leads.editar).
    const res = await agent.post(`/api/lojas/${f.lojaId}/leads/${leadA.id}/portal`).expect(201);
    token = res.body.token;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("token válido devolve as 4 seções coerentes com a fixture — e nada da outra noiva", async () => {
    const res = await publico().get(`/api/portal?token=${token}`).expect(200);
    const portal = res.body;

    expect(portal.noivaNome).toBe(leadA.noivaNome);
    expect(portal.orcamento.status).toBe("ENVIADO");
    expect(portal.orcamento.totalLiquido).toBe(4000);
    expect(portal.lookbook.vestidos).toHaveLength(1);
    expect(portal.provas).toHaveLength(1);
    expect(portal.parcelas).toHaveLength(2);

    // Parcelas de OUTRA noiva jamais: os 9999 do contrato B não aparecem.
    expect(portal.parcelas.every((p: { valorPrevisto: number }) => p.valorPrevisto === 2000)).toBe(true);

    // O carimbo do card: ela abriu.
    const status = await agent.get(`/api/lojas/${f.lojaId}/leads/${leadA.id}/portal`).expect(200);
    expect(status.body.ultimoAcessoEm).toBeTruthy();
  });

  it("o aceite pelo portal grava o MESMO rastro do E74", async () => {
    const res = await publico().post(`/api/portal/aceite?token=${token}`).expect(200);
    expect(res.body.aceitoEm).toBeTruthy();

    const [orcamento] = await db.select().from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamentoId));
    expect(orcamento.status).toBe("APROVADO");
    expect(orcamento.aceitoEm).toBeTruthy();

    const trilha = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.lojaId, f.lojaId),
      eq(auditLogTable.acao, "ORCAMENTO_ACEITO"),
      eq(auditLogTable.entidadeId, orcamentoId),
    ));
    expect(trilha).toHaveLength(1);
    expect(trilha[0].usuarioNome).toBe(`${leadA.noivaNome} (link público)`);

    // Idempotente: o segundo clique devolve o MESMO aceite.
    const denovo = await publico().post(`/api/portal/aceite?token=${token}`).expect(200);
    expect(denovo.body.aceitoEm).toBe(res.body.aceitoEm);
  });

  it("regenerar mata o link antigo; revogar responde como desconhecido", async () => {
    const novo = await agent.post(`/api/lojas/${f.lojaId}/leads/${leadA.id}/portal`).expect(201);
    expect(novo.body.token).not.toBe(token);
    await publico().get(`/api/portal?token=${token}`).expect(404);
    await publico().get(`/api/portal?token=${novo.body.token}`).expect(200);

    await agent.delete(`/api/lojas/${f.lojaId}/leads/${leadA.id}/portal`).expect(204);
    await publico().get(`/api/portal?token=${novo.body.token}`).expect(404);

    // Regenerar depois de revogado volta à vida — com token novo.
    const terceiro = await agent.post(`/api/lojas/${f.lojaId}/leads/${leadA.id}/portal`).expect(201);
    await publico().get(`/api/portal?token=${terceiro.body.token}`).expect(200);
  });

  it("a noiva confirma a prova pelo portal — carimbo, rastro e escopo (E85)", async () => {
    // O portal atual (regenerado nos testes anteriores) e as provas dele.
    const status = await agent.get(`/api/lojas/${f.lojaId}/leads/${leadA.id}/portal`).expect(200);
    const tokenVivo = status.body.token;
    const portal = await publico().get(`/api/portal?token=${tokenVivo}`).expect(200);
    const prova = portal.body.provas[0];
    expect(prova.id).toBeTruthy();
    expect(prova.confirmadoEm).toBeFalsy();

    // Confirma: o carimbo é o MESMO confirmadoEm do E39.
    const res = await publico()
      .post(`/api/portal/provas/${prova.id}/confirmar?token=${tokenVivo}`)
      .expect(200);
    expect(res.body.confirmadoEm).toBeTruthy();
    const [linha] = await db.select().from(atendimentosTable)
      .where(eq(atendimentosTable.id, prova.id));
    expect(linha.confirmadoEm).not.toBeNull();

    // Idempotente: o segundo clique devolve o MESMO carimbo.
    const denovo = await publico()
      .post(`/api/portal/provas/${prova.id}/confirmar?token=${tokenVivo}`)
      .expect(200);
    expect(denovo.body.confirmadoEm).toBe(res.body.confirmadoEm);

    // O rastro da noiva na trilha.
    const trilha = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.acao, "PROVA_CONFIRMADA"),
      eq(auditLogTable.entidadeId, prova.id),
    ));
    expect(trilha).toHaveLength(1);
    expect(trilha[0].usuarioNome).toBe(`${leadA.noivaNome} (link público)`);

    // O escopo: prova de OUTRA noiva é 404 mesmo existindo.
    const b = await criarLead(f);
    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine E85" });
    const provaDeB = randomUUID();
    await db.insert(atendimentosTable).values({
      id: provaDeB,
      lojaId: f.lojaId,
      leadId: b.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      inicio: dataFutura(21),
    });
    await publico()
      .post(`/api/portal/provas/${provaDeB}/confirmar?token=${tokenVivo}`)
      .expect(404);

    // Atendimento comum (não PROVA) da própria noiva: 422.
    const comum = randomUUID();
    await db.insert(atendimentosTable).values({
      id: comum,
      lojaId: f.lojaId,
      leadId: leadA.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "ATENDIMENTO",
      inicio: dataFutura(22),
    });
    await publico()
      .post(`/api/portal/provas/${comum}/confirmar?token=${tokenVivo}`)
      .expect(422);
  });

  it("GET /portais devolve o lote da PRÓPRIA loja — a outra não vaza (E84)", async () => {
    // Segunda loja com portal próprio: o lote de f não pode enxergá-la.
    const g = await criarFixture();
    try {
      const agentG = await loginComLoja(g.superAdminEmail, g.lojaId);
      const leadG = await criarLead(g);
      await agentG.post(`/api/lojas/${g.lojaId}/leads/${leadG.id}/portal`).expect(201);

      const res = await agent.get(`/api/lojas/${f.lojaId}/portais`).expect(200);
      const leads = res.body.map((p: { leadId: string }) => p.leadId);
      expect(leads).toContain(leadA.id);
      expect(leads).not.toContain(leadG.id);
      // O shape do lote é o que as mensagens cruzam.
      const linha = res.body.find((p: { leadId: string }) => p.leadId === leadA.id);
      expect(linha.token).toBeTruthy();
      expect(linha.expiraEm).toBeTruthy();
    } finally {
      await limparFixture(g);
    }
  });

  it("token inventado (ou ausente) é 404 — como nas irmãs públicas", async () => {
    await publico().get(`/api/portal?token=${randomUUID()}`).expect(404);
    // O zod gerado coage ausência para a string "undefined" — cai no mesmo 404.
    await publico().get(`/api/portal`).expect(404);
  });
});
