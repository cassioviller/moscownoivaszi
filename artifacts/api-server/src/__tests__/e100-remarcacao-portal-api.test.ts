import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, atendimentosTable, cabinesTable, auditLogTable, portalTokensTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../app";
import {
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * F37/E100 — a noiva avisa que NÃO pode ir.
 *
 * A única ação dela no portal era "confirmo que vou", e ninguém abre um link
 * para dizer que vai: abre para dizer que não. O aviso que faltava é o que
 * devolve à loja os três recursos mais caros do ateliê — a cabine, a hora da
 * vendedora e o vestido separado — com antecedência em vez de com a ausência.
 *
 * O que estes casos defendem, e que uma implementação apressada erraria:
 * o pedido **não cancela nada** (é pedido, não remarcação), quem **já
 * confirmou** não desmarca por aqui, e o rastro sai com a noiva como autora —
 * sem sessão, como o aceite do E74 e a confirmação do E85.
 */
describe("F37 — o pedido de remarcação pelo portal", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadId: string;
  let cabineId: string;
  let token: string;

  const publico = () => request(app);

  /**
   * Uma prova futura AGENDADA da noiva do portal.
   *
   * Cada caso ganha um DIA próprio, e isso não é estilo: o banco tem
   * `unique(cabine_id, inicio)` — a guarda que impede duas noivas na mesma
   * cabine à mesma hora. Escrevi este helper com `dataFutura(10)` fixo e sete
   * casos caíram com 23505 antes de o primeiro assert rodar. O código estava
   * certo; o teste é que marcava sete provas no mesmo horário.
   */
  let diaDaProva = 5;
  async function criarProva(over: Partial<typeof atendimentosTable.$inferInsert> = {}) {
    const id = randomUUID();
    await db.insert(atendimentosTable).values({
      id,
      lojaId: f.lojaId,
      leadId,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      inicio: dataFutura(diaDaProva++),
      ...over,
    });
    return id;
  }

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f, { noivaNome: "Noiva do F37" });
    leadId = lead.id;

    cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine F37" });

    const criado = await agent.post(`/api/lojas/${f.lojaId}/leads/${leadId}/portal`).expect(201);
    token = criado.body.token;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("registra o pedido e devolve o carimbo", async () => {
    const provaId = await criarProva();

    const res = await publico()
      .post(`/api/portal/provas/${provaId}/remarcar`)
      .query({ token });

    expect(res.status, res.text).toBe(200);
    expect(res.body.remarcacaoPedidaEm).toBeTruthy();
  });

  it("NÃO cancela nem move nada — é pedido, não remarcação", async () => {
    const provaId = await criarProva();
    const antes = await db.query.atendimentosTable.findFirst({
      where: eq(atendimentosTable.id, provaId),
    });

    await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token }).expect(200);

    const depois = await db.query.atendimentosTable.findFirst({
      where: eq(atendimentosTable.id, provaId),
    });
    // O horário, a cabine e o vestido seguem presos: cancelar por um clique num
    // link deixaria a noiva sem horário nenhum e devolveria o recurso sem
    // ninguém da loja saber.
    expect(depois!.situacao).toBe("AGENDADO");
    expect(depois!.inicio.toISOString()).toBe(antes!.inicio.toISOString());
    expect(depois!.cabineId).toBe(antes!.cabineId);
    expect(depois!.remarcacaoPedidaEm).toBeTruthy();
  });

  it("é idempotente: o segundo clique devolve o mesmo carimbo, não um erro", async () => {
    const provaId = await criarProva();

    const um = await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token }).expect(200);
    const dois = await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token }).expect(200);

    expect(dois.body.remarcacaoPedidaEm).toBe(um.body.remarcacaoPedidaEm);
  });

  it("quem JÁ CONFIRMOU não desmarca por aqui — 422 que ensina o caminho", async () => {
    const provaId = await criarProva({ confirmadoEm: new Date() });

    const res = await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token });

    expect(res.status, res.text).toBe(422);
    expect(res.body.error).toBe("JA_CONFIRMADA");
    // A frase precisa dizer o que fazer: a loja já separou a peça e escalou a
    // costureira em cima daquele sim.
    expect(res.body.detalhe).toContain("vendedora");
  });

  it("prova já passada não se remarca pelo portal", async () => {
    const provaId = await criarProva({ inicio: new Date(Date.now() - 3_600_000) });

    const res = await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token });

    expect(res.status, res.text).toBe(422);
    expect(res.body.error).toBe("NADA_A_REMARCAR");
  });

  it("a prova de OUTRA noiva é 404, mesmo existindo", async () => {
    const outra = await criarLead(f, { noivaNome: "Outra Noiva" });
    const provaDela = randomUUID();
    await db.insert(atendimentosTable).values({
      id: provaDela,
      lojaId: f.lojaId,
      leadId: outra.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      inicio: dataFutura(diaDaProva++),
    });

    const res = await publico().post(`/api/portal/provas/${provaDela}/remarcar`).query({ token });

    expect(res.status, res.text).toBe(404);
  });

  it("o rastro sai com a NOIVA como autora, sem sessão", async () => {
    const provaId = await criarProva();
    await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token }).expect(200);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, provaId), eq(auditLogTable.acao, "REMARCACAO_PEDIDA")));

    expect(linha).toBeTruthy();
    expect(linha!.usuarioId).toBeNull();
    expect(linha!.usuarioNome).toContain("link público");
  });

  it("o portal MOSTRA que ela já pediu — senão ela clicaria de novo", async () => {
    const provaId = await criarProva();
    await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token }).expect(200);

    const portal = await publico().get("/api/portal").query({ token }).expect(200);
    const prova = portal.body.provas.find((p: { id: string }) => p.id === provaId);

    expect(prova, "a prova aparece no portal").toBeTruthy();
    expect(prova.remarcacaoPedidaEm).toBeTruthy();
  });

  it("o aviso CHEGA na lista da loja — senão ele morre no banco", async () => {
    const provaId = await criarProva();
    await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token }).expect(200);

    // A fila da loja lê `listAtendimentos`. Se o campo não estivesse no schema
    // da resposta, o `.parse` o descartaria e o aviso da noiva ficaria só no
    // banco — o horário preso até a ausência, que é exatamente o que o F37
    // existe para impedir.
    const lista = await agent.get(`/api/lojas/${f.lojaId}/atendimentos`).expect(200);
    const naLista = lista.body.find((a: { id: string }) => a.id === provaId);

    expect(naLista, "a prova aparece na lista da loja").toBeTruthy();
    expect(naLista.remarcacaoPedidaEm).toBeTruthy();
  });

  it("link expirado não registra pedido", async () => {
    const provaId = await criarProva();
    await db
      .update(portalTokensTable)
      .set({ expiraEm: new Date(Date.now() - 1000) })
      .where(eq(portalTokensTable.leadId, leadId));

    const res = await publico().post(`/api/portal/provas/${provaId}/remarcar`).query({ token });

    expect(res.status).toBe(410);

    // devolve o portal ao normal para não contaminar outro caso
    await db
      .update(portalTokensTable)
      .set({ expiraEm: dataFutura(30) })
      .where(eq(portalTokensTable.leadId, leadId));
  });
});
