import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarVestido,
  criarLead,
  criarReserva,
  criarBloqueio,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E179 — a reserva ganha porta de leitura (S-O18), e o `donoLeadId` que o
 * contrato declara para de faltar na listagem (S-O17).
 *
 * A única leitura de uma reserva era `GET /lojas/:lojaId/reservas`, a loja
 * INTEIRA. Quem precisa de UMA — a ficha, o conserto do V14, o `casamentoData`
 * do V5 — baixava todas e filtrava no cliente, exatamente o que o E79 tirou do
 * bloqueio e o E125 tirou do atendimento.
 *
 * E o `donoLeadId` do schema `BloqueioVestido` só era preenchido pelo `GET` e
 * pelo `PATCH` de um bloqueio: a listagem declarava o campo e devolvia
 * `undefined`, em silêncio.
 */
describe("A reserva lida sozinha, e o dono do bloqueio dito em toda porta (E179)", () => {
  let f: Fixture;
  let outra: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadId: string;
  let reservaId: string;
  let bloqueioComDona: string;
  let bloqueioSemDona: string;
  let reservaDaOutraLoja: string;
  const casamento = dataFutura(120);

  beforeAll(async () => {
    f = await criarFixture();
    outra = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);

    const lead = await criarLead(f);
    leadId = lead.id;
    reservaId = (await criarReserva(f, { leadId, casamentoData: casamento })).id;

    // O vestido da noiva: `lead_id` próprio.
    bloqueioComDona = (
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: (await criarVestido(f)).id,
        leadId,
        reservaId,
        casamentoData: casamento,
      })
    ).id;
    // O véu: pendurado na MESMA reserva, sem `lead_id` (V14/E167). S-C10
    // (13/08/2026): o comentário dizia "61 das 63 avarias do banco vivem assim"
    // e a montagem é RARA no banco — em `moscow_base` são 115 de 116 bloqueios
    // pendurados numa reserva-mãe e TODOS com `lead_id` próprio, logo ZERO véus.
    // O teste prega a derivação, que é a mesma com um véu ou com mil.
    bloqueioSemDona = (
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: (await criarVestido(f)).id,
        leadId: null,
        reservaId,
        casamentoData: casamento,
      })
    ).id;

    const leadDaOutra = await criarLead(outra);
    reservaDaOutraLoja = (
      await criarReserva(outra, { leadId: leadDaOutra.id, casamentoData: casamento })
    ).id;
  });

  afterAll(async () => {
    await limparFixture(f);
    await limparFixture(outra);
    await fecharPool();
  });

  it("GET /reservas/{id} devolve UMA reserva, com a noiva e os bloqueios (com vestido)", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/reservas/${reservaId}`).expect(200);
    expect(res.body.id).toBe(reservaId);
    expect(res.body.leadId).toBe(leadId);
    expect(res.body.lead?.id).toBe(leadId);
    const ids = res.body.bloqueios.map((b: { id: string }) => b.id).sort();
    expect(ids).toEqual([bloqueioComDona, bloqueioSemDona].sort());
    for (const b of res.body.bloqueios) expect(b.vestido?.id).toBeTruthy();
  });

  it("e os bloqueios dela dizem de QUEM são — inclusive o que não tem lead_id próprio", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/reservas/${reservaId}`).expect(200);
    const dono = Object.fromEntries(
      res.body.bloqueios.map((b: { id: string; donoLeadId: string | null }) => [b.id, b.donoLeadId]),
    );
    expect(dono[bloqueioComDona]).toBe(leadId);
    expect(dono[bloqueioSemDona]).toBe(leadId);
  });

  it("id que não existe é 404, e a reserva de OUTRA loja também", async () => {
    await agent.get(`/api/lojas/${f.lojaId}/reservas/${randomUUID()}`).expect(404);
    // A fronteira de loja (E111) não alcança este caso: a URL diz a loja da
    // sessão, e o id é que é de fora. Quem recusa é o `and(id, lojaId)`.
    const alheia = await agent
      .get(`/api/lojas/${f.lojaId}/reservas/${reservaDaOutraLoja}`)
      .expect(404);
    expect(alheia.body.error).toBe("RESERVA_NAO_ENCONTRADA");
  });

  it("S-O17 — a LISTAGEM de bloqueios preenche donoLeadId, como o GET e o PATCH", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/bloqueios`).expect(200);
    const dono = Object.fromEntries(
      res.body.map((b: { id: string; donoLeadId: string | null }) => [b.id, b.donoLeadId]),
    );
    expect(dono[bloqueioComDona]).toBe(leadId);
    // O que a sobra media: o véu herdava o dono no GET e vinha `undefined` aqui.
    expect(dono[bloqueioSemDona]).toBe(leadId);
  });

  it("e o recorte por noiva continua sendo o do lead_id PRÓPRIO — herdar dono não é ser da noiva", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/bloqueios?leadId=${leadId}`).expect(200);
    expect(res.body.map((b: { id: string }) => b.id)).toEqual([bloqueioComDona]);
  });

  it("e o POST devolve o dono já na criação — quem cria o véu manda reservaId, não leadId", async () => {
    // Reserva própria: as asserções acima contam os bloqueios da outra.
    const outroCasamento = dataFutura(200);
    const mae = await criarReserva(f, { leadId, casamentoData: outroCasamento });
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios`)
      .send({
        vestidoId: (await criarVestido(f)).id,
        tipo: "RESERVA_CASAMENTO",
        reservaId: mae.id,
        casamentoData: outroCasamento.toISOString(),
      })
      .expect(201);
    expect(res.body.leadId).toBeNull();
    expect(res.body.donoLeadId).toBe(leadId);
  });

  it("a listagem de reservas também diz o dono de cada bloqueio", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/reservas`).expect(200);
    const minha = res.body.find((r: { id: string }) => r.id === reservaId);
    const dono = Object.fromEntries(
      minha.bloqueios.map((b: { id: string; donoLeadId: string | null }) => [b.id, b.donoLeadId]),
    );
    expect(dono).toEqual({ [bloqueioComDona]: leadId, [bloqueioSemDona]: leadId });
  });
});
