import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  atendimentosTable,
  auditLogTable,
  avariasTable,
  bloqueioVestidosTable,
  cabinesTable,
  contratoBloqueiosTable,
  db,
  reservasTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E115 — nada some sem 404, contagem e rastro: os cinco DELETEs que o E91, o
 * E106 e o E111 não alcançaram.
 *
 * `DELETE /reservas/:id` era um delete cru e a cascata dele é a mais funda do
 * domínio: `bloqueio_vestidos.reserva_id` é CASCADE, e de cada bloqueio caem
 * as avarias (a foto-prova que sustenta uma parcela JÁ COBRADA — o 409
 * AVARIA_COM_COBRANCA do E97/F23 não roda, porque a cascata não passa pela
 * rota), os atendimentos/provas e os vínculos de contratos ATIVOS — a peça
 * voltava a aparecer disponível para outra noiva. `DELETE /bloqueios/:id` era
 * o mesmo, um nível abaixo. `DELETE /atendimentos/:id` respondia 204 mesmo sem
 * apagar nada e levava a fila de costura junto. `DELETE /orcamentos/:id`
 * apagava um APROVADO com o hash do aceite dentro. E `DELETE /avarias/:id`
 * tinha guarda e não tinha trilha.
 *
 * **S-M1 (2026-08-10): eram SEIS.** A cabine ficou de fora da varredura do
 * E115 e sobreviveu mais três semanas como delete cru — o único da família
 * cuja cascata leva ATENDIMENTOS inteiros, e por baixo deles a fila de
 * costura. O caso novo mora aqui, e não em arquivo próprio, porque é
 * literalmente o sexto de cinco.
 */
describe("E115 — nada some sem 404, contagem e rastro", () => {
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

  async function reservaComBloqueio() {
    const lead = await criarLead(f);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataFutura(60) });
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(60),
      leadId: lead.id,
      reservaId: reserva.id,
    });
    return { lead, reserva, bloqueio };
  }

  async function trilha(acao: string, entidadeId: string) {
    return db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, acao),
        eq(auditLogTable.entidadeId, entidadeId),
      ));
  }

  it("reserva com avaria registrada NÃO se apaga — a foto-prova sumiria junto", async () => {
    const { reserva, bloqueio } = await reservaComBloqueio();
    const [avaria] = await db
      .insert(avariasTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, bloqueioId: bloqueio.id, descricao: "Rasgo na barra" })
      .returning();

    // VERMELHO ANTES: 204 — a reserva, o bloqueio e a avaria (com a foto que
    // sustenta a cobrança) sumiam em cascata, sem uma linha de auditoria.
    const r = await agent.delete(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`).expect(409);
    expect(r.body.error).toBe("RESERVA_COM_HISTORICO");
    expect(r.body.avarias).toBe(1);

    const [aindaLa] = await db.select().from(avariasTable).where(eq(avariasTable.id, avaria.id));
    expect(aindaLa).toBeDefined();
  });

  it("reserva presa a contrato ATIVO não se apaga — a peça voltaria ao mercado", async () => {
    const { lead, reserva, bloqueio } = await reservaComBloqueio();
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 5000, fechadoEm: new Date() });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });

    // VERMELHO ANTES: 204 — o vínculo contrato_bloqueios cascateava e o
    // contrato ATIVO perdia o vestido reservado.
    const r = await agent.delete(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`).expect(409);
    expect(r.body.error).toBe("RESERVA_COM_HISTORICO");
    expect(r.body.contratosAtivos).toBe(1);
  });

  it("reserva sem história se apaga — com 404 antes e trilha depois", async () => {
    const { reserva } = await reservaComBloqueio();
    // O bloqueio vazio da reserva não segura: ele é a própria reserva.
    // Mas um atendimento/prova agendado segura — então este cenário não o tem.
    await agent.delete(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`).expect(204);

    // VERMELHO ANTES: nenhuma linha — a exclusão não deixava rastro.
    expect((await trilha("RESERVA_REMOVIDA", reserva.id)).length).toBe(1);

    // VERMELHO ANTES: 204 para o inexistente — "apagado" sem apagar nada.
    await agent.delete(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`).expect(404);
  });

  it("bloqueio preso a contrato ATIVO não se apaga direto", async () => {
    const { lead, bloqueio } = await reservaComBloqueio();
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 5000, fechadoEm: new Date() });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });

    // VERMELHO ANTES: 204 — mesmo defeito da reserva, um nível abaixo.
    const r = await agent.delete(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`).expect(409);
    expect(r.body.error).toBe("BLOQUEIO_COM_HISTORICO");
    expect(r.body.contratosAtivos).toBe(1);

    const [aindaLa] = await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(aindaLa).toBeDefined();
  });

  it("atendimento CONCLUÍDO não se apaga; AGENDADO sai com trilha; com ajuste, não sai", async () => {
    const lead = await criarLead(f);
    const [cabine] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, nome: `Cabine ${randomUUID().slice(0, 6)}` })
      .returning();

    async function atendimento(situacao: "AGENDADO" | "CONCLUIDO", inicio: Date) {
      const [a] = await db
        .insert(atendimentosTable)
        .values({
          id: randomUUID(),
          lojaId: f.lojaId,
          leadId: lead.id,
          cabineId: cabine.id,
          vendedoraId: f.vendedoraId,
          inicio,
          situacao,
          atendidoEm: situacao === "CONCLUIDO" ? inicio : null,
        })
        .returning();
      return a;
    }

    // VERMELHO ANTES: 204 — o que ACONTECEU com a noiva sumia da ficha.
    const concluido = await atendimento("CONCLUIDO", dataFutura(-30));
    const r1 = await agent.delete(`/api/lojas/${f.lojaId}/atendimentos/${concluido.id}`).expect(409);
    expect(r1.body.error).toBe("ATENDIMENTO_CONCLUIDO");

    // VERMELHO ANTES: 204 e o ajuste de costura sumia em cascata.
    const comAjuste = await atendimento("AGENDADO", dataFutura(5));
    await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: comAjuste.id, descricao: "Barra", valor: 100 })
      .expect(201);
    const r2 = await agent.delete(`/api/lojas/${f.lojaId}/atendimentos/${comAjuste.id}`).expect(409);
    expect(r2.body.error).toBe("ATENDIMENTO_COM_AJUSTES");

    // O caminho do dia a dia continua aberto — desmarcar um AGENDADO — e
    // agora deixa rastro. VERMELHO ANTES: trilha vazia.
    const agendado = await atendimento("AGENDADO", dataFutura(6));
    await agent.delete(`/api/lojas/${f.lojaId}/atendimentos/${agendado.id}`).expect(204);
    expect((await trilha("ATENDIMENTO_REMOVIDO", agendado.id)).length).toBe(1);

    await agent.delete(`/api/lojas/${f.lojaId}/atendimentos/${agendado.id}`).expect(404);
  });

  it("S-M1 — cabine com agenda não se apaga; a vazia sai com trilha", async () => {
    const lead = await criarLead(f);

    async function cabine() {
      const [c] = await db
        .insert(cabinesTable)
        .values({ id: randomUUID(), lojaId: f.lojaId, nome: `Cabine ${randomUUID().slice(0, 6)}` })
        .returning();
      return c;
    }

    // A cabine que a loja usa todo dia: uma prova AGENDADA e uma CONCLUÍDA. A
    // concluída é a que dói — ela é a história da ficha da noiva e não se
    // remarca. VERMELHO ANTES: 204, e as duas sumiam pelo CASCADE de
    // `atendimentos.cabine_id`, sem 409, sem rastro e sem transação.
    const emUso = await cabine();
    // Os offsets são exclusivos deste `it`: `atendimentos` tem UNIQUE (loja,
    // vendedora, inicio) e a fixture da loja é compartilhada pelo arquivo.
    for (const [situacao, quando] of [["CONCLUIDO", -41], ["AGENDADO", 41]] as const) {
      await db.insert(atendimentosTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        leadId: lead.id,
        cabineId: emUso.id,
        vendedoraId: f.vendedoraId,
        inicio: dataFutura(quando),
        situacao,
        atendidoEm: situacao === "CONCLUIDO" ? dataFutura(quando) : null,
      });
    }
    const r = await agent.delete(`/api/lojas/${f.lojaId}/cabines/${emUso.id}`).expect(409);
    expect(r.body.error).toBe("CABINE_COM_AGENDA");
    expect(r.body.detalhe).toContain("2 atendimentos");
    // E o 409 não é conselho: a agenda continua lá.
    expect(
      (await db.select().from(atendimentosTable).where(eq(atendimentosTable.cabineId, emUso.id))).length,
    ).toBe(2);

    // A cabine criada por engano continua saindo — e agora deixa rastro.
    // VERMELHO ANTES: trilha vazia.
    const vazia = await cabine();
    await agent.delete(`/api/lojas/${f.lojaId}/cabines/${vazia.id}`).expect(204);
    const linhas = await trilha("CABINE_REMOVIDA", vazia.id);
    expect(linhas.length).toBe(1);
    expect((linhas[0]!.detalhe as { nome: string }).nome).toBe(vazia.nome);

    // VERMELHO ANTES: 204 sobre o nada, e sobre cabine de OUTRA loja também.
    await agent.delete(`/api/lojas/${f.lojaId}/cabines/${vazia.id}`).expect(404);
  });

  it("orçamento APROVADO não se apaga — o hash do aceite mora nele", async () => {
    const lead = await criarLead(f);
    const aprovado = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });

    // VERMELHO ANTES: 204 — as versões congeladas (com o hash que a noiva
    // aceitou) caíam em cascata.
    const r = await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/${aprovado.id}`).expect(409);
    expect(r.body.error).toBe("ORCAMENTO_APROVADO");

    // Rascunho sai — com trilha. VERMELHO ANTES: sem trilha, e 204 para o
    // inexistente.
    const rascunho = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/${rascunho.id}`).expect(204);
    expect((await trilha("ORCAMENTO_REMOVIDO", rascunho.id)).length).toBe(1);
    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/${rascunho.id}`).expect(404);
  });

  it("apagar uma avaria não cobrada deixa rastro", async () => {
    const { bloqueio } = await reservaComBloqueio();
    const [avaria] = await db
      .insert(avariasTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, bloqueioId: bloqueio.id, descricao: "Mancha no tule", custoReparo: 350 })
      .returning();

    await agent.delete(`/api/lojas/${f.lojaId}/avarias/${avaria.id}`).expect(204);

    // VERMELHO ANTES: trilha vazia — a foto-prova de um dano sumia sem autor.
    const linhas = await trilha("AVARIA_REMOVIDA", avaria.id);
    expect(linhas.length).toBe(1);
    expect((linhas[0].detalhe as { custoReparo: number }).custoReparo).toBe(350);

    // VERMELHO ANTES: 204 para o inexistente.
    await agent.delete(`/api/lojas/${f.lojaId}/avarias/${avaria.id}`).expect(404);
  });
});
