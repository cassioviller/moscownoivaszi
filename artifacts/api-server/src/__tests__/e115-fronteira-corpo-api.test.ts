import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  atendimentosTable,
  atributoOpcoesTable,
  atributosTable,
  cabinesTable,
  db,
} from "@workspace/db";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E115 — os três ids de CORPO que ainda entravam sem prova de loja.
 *
 * O E91 estabeleceu a régua ("nenhum id entra sem prova") e o E111 fechou o id
 * do PATH; sobraram três FKs de corpo: o `atendimentoId` do ajuste de costura
 * (a fila da costureira de A passava a exibir a ficha da noiva de B, e o
 * conserto forjado aparecia no portal da noiva de B), o `bloqueioId` opcional
 * do POST /atendimentos (uma prova agendada sobre o vestido reservado de outra
 * loja) e os pares (atributo, opção) do interesse da noiva. E o upsert do
 * interesse corria em três statements fora de transação.
 */
describe("E115 — nenhum id de corpo entra sem prova de loja", () => {
  let a: Fixture;
  let b: Fixture;
  let agentA: Awaited<ReturnType<typeof loginComLoja>>;

  let cabineA: { id: string };
  let atendimentoB: { id: string };
  let atributoB: { id: string; opcaoId: string };
  let atributoA: { id: string; opcaoId: string };

  beforeAll(async () => {
    a = await criarFixture();
    b = await criarFixture();
    agentA = await loginComLoja(a.vendedoraEmail, a.lojaId);

    [cabineA] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: a.lojaId, nome: `Cabine A ${randomUUID().slice(0, 6)}` })
      .returning();

    // O mundo da loja B: um atendimento e um vocabulário próprio.
    const leadB = await criarLead(b);
    const [cabineB] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: b.lojaId, nome: `Cabine B ${randomUUID().slice(0, 6)}` })
      .returning();
    [atendimentoB] = await db
      .insert(atendimentosTable)
      .values({
        id: randomUUID(),
        lojaId: b.lojaId,
        leadId: leadB.id,
        cabineId: cabineB.id,
        vendedoraId: b.vendedoraId,
        inicio: dataFutura(5),
        situacao: "AGENDADO",
      })
      .returning();

    async function atributoCom(f: Fixture, nome: string) {
      const [atr] = await db
        .insert(atributosTable)
        .values({ id: randomUUID(), lojaId: f.lojaId, nome })
        .returning();
      const [opcao] = await db
        .insert(atributoOpcoesTable)
        .values({ id: randomUUID(), atributoId: atr.id, valor: "Marfim" })
        .returning();
      return { id: atr.id, opcaoId: opcao.id };
    }
    atributoB = await atributoCom(b, "Cor B");
    atributoA = await atributoCom(a, "Cor A");
  });

  afterAll(async () => {
    // O contorno que morava aqui saiu com a S31 (`4ea4fe2`… ver o hash no
    // rastreador): as 4 FKs do vocabulário passaram a CASCADE e a cascata da
    // loja leva o atributo e as linhas do interesse na mesma operação.
    await limparFixture(a);
    await limparFixture(b);
    await fecharPool();
  });

  it("ajuste apontando para atendimento de OUTRA loja é recusado", async () => {
    // VERMELHO ANTES: 201 — e o GET /lojas/A/ajustes devolvia a ficha da
    // noiva de B (nome e WhatsApp) dentro da fila de costura de A.
    const r = await agentA
      .post(`/api/lojas/${a.lojaId}/ajustes`)
      .send({ atendimentoId: atendimentoB.id, descricao: "Barra" })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");
  });

  it("atendimento apontando para bloqueio de OUTRA loja é recusado", async () => {
    const leadA = await criarLead(a);
    const vestidoB = await criarVestido(b);
    const bloqueioB = await criarBloqueio(b, {
      vestidoId: vestidoB.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(60),
    });

    // VERMELHO ANTES: 201 — uma prova agendada sobre a peça reservada de
    // outra loja, com lead/cabine/vendedora conferidos e o bloqueio não.
    const r = await agentA
      .post(`/api/lojas/${a.lojaId}/atendimentos`)
      .send({
        leadId: leadA.id,
        cabineId: cabineA.id,
        vendedoraId: a.vendedoraId,
        tipo: "PROVA",
        bloqueioId: bloqueioB.id,
        inicio: dataFutura(7).toISOString(),
      })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");
  });

  it("interesse da noiva não aceita vocabulário de OUTRA loja — e o da própria entra", async () => {
    const leadA = await criarLead(a);

    // VERMELHO ANTES: 200 — o interesse gravava o par de B.
    const r = await agentA
      .put(`/api/lojas/${a.lojaId}/leads/${leadA.id}/interesse`)
      .send({ atributos: [{ atributoId: atributoB.id, opcaoId: atributoB.opcaoId }] })
      .expect(422);
    expect(r.body.error).toBe("REFERENCIA_INVALIDA");

    // A porta de casa continua aberta.
    const ok = await agentA
      .put(`/api/lojas/${a.lojaId}/leads/${leadA.id}/interesse`)
      .send({ atributos: [{ atributoId: atributoA.id, opcaoId: atributoA.opcaoId }] })
      .expect(200);
    expect(ok.body.atributos).toHaveLength(1);
  });

  it("opção de um atributo no atributo errado é recusada mesmo dentro da loja", async () => {
    const leadA = await criarLead(a);
    const [outroAtr] = await db
      .insert(atributosTable)
      .values({ id: randomUUID(), lojaId: a.lojaId, nome: "Tamanho A" })
      .returning();

    // "Marfim" (opção da Cor) declarada como se fosse do Tamanho: a régua
    // `atributosDaLoja` confere o PAI da opção, não só a loja.
    await agentA
      .put(`/api/lojas/${a.lojaId}/leads/${leadA.id}/interesse`)
      .send({ atributos: [{ atributoId: outroAtr.id, opcaoId: atributoA.opcaoId }] })
      .expect(422);
  });
});
