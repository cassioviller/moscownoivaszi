import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, atendimentosTable, cabinesTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarVestido,
  criarLead,
  criarBloqueio,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E79 — os recortes de reservas e agenda: a ficha do orçamento pede os
 * bloqueios DA noiva, a ficha da reserva pede UM bloqueio e as provas DELE,
 * a tela de provas pede só PROVA. Ninguém baixa a loja inteira para filtrar
 * no cliente.
 */
describe("Recortes de bloqueios e atendimentos (E79)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadA: string;
  let bloqueioA: string;
  let bloqueioB: string;
  let provaA: string;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);

    const a = await criarLead(f);
    const b = await criarLead(f);
    leadA = a.id;
    const casamento = dataFutura(90);
    bloqueioA = (
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: (await criarVestido(f)).id,
        leadId: a.id,
        casamentoData: casamento,
      })
    ).id;
    bloqueioB = (
      await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: (await criarVestido(f)).id,
        leadId: b.id,
        casamentoData: casamento,
      })
    ).id;

    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine E79" });
    // Dias distintos: a cabine tem unique (cabineId, inicio).
    let dia = 7;
    const atendimento = (leadId: string, tipo: "ATENDIMENTO" | "PROVA", bloqueioId: string | null) => ({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo,
      bloqueioId,
      inicio: dataFutura(dia++),
    });
    const provaDeA = atendimento(a.id, "PROVA", bloqueioA);
    provaA = provaDeA.id;
    await db.insert(atendimentosTable).values([
      provaDeA,
      atendimento(b.id, "PROVA", bloqueioB),
      atendimento(a.id, "ATENDIMENTO", null),
    ]);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("bloqueios?leadId= devolve só os da noiva", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/bloqueios?leadId=${leadA}`)
      .expect(200);
    expect(res.body.map((b: { id: string }) => b.id)).toEqual([bloqueioA]);
  });

  it("GET /bloqueios/{id} devolve um só, com vestido e noiva; inexistente é 404", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioA}`).expect(200);
    expect(res.body.id).toBe(bloqueioA);
    expect(res.body.vestido?.id).toBeTruthy();
    expect(res.body.lead?.id).toBe(leadA);

    await agent.get(`/api/lojas/${f.lojaId}/bloqueios/${randomUUID()}`).expect(404);
  });

  it("atendimentos?bloqueioId= devolve as provas do bloqueio, não da loja", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?bloqueioId=${bloqueioA}`)
      .expect(200);
    expect(res.body.map((a: { id: string }) => a.id)).toEqual([provaA]);
  });

  it("atendimentos?de&ate recortam por dia local, inclusivos, e compõem com tipo (E83)", async () => {
    // A fixture escalona: prova A em +7d, prova B em +8d, comum em +9d.
    const ymd = (offset: number) => {
      const d = dataFutura(offset);
      return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    };

    const doisDias = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?de=${ymd(7)}&ate=${ymd(8)}`)
      .expect(200);
    expect(doisDias.body).toHaveLength(2);

    // Composição: a janela dos três dias, só PROVA — o comum de +9d cai fora.
    const provasNaJanela = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?de=${ymd(7)}&ate=${ymd(9)}&tipo=PROVA`)
      .expect(200);
    expect(provasNaJanela.body).toHaveLength(2);

    // Janela vazia devolve lista vazia; invertida é 400.
    const nada = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?de=${ymd(20)}&ate=${ymd(21)}`)
      .expect(200);
    expect(nada.body).toHaveLength(0);
    await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?de=${ymd(8)}&ate=${ymd(7)}`)
      .expect(400);
  });

  it("atendimentos?tipo=PROVA descarta o atendimento comum; tipo inválido é 400", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?tipo=PROVA`)
      .expect(200);
    const tipos = new Set(res.body.map((a: { tipo: string }) => a.tipo));
    expect(tipos).toEqual(new Set(["PROVA"]));
    expect(res.body).toHaveLength(2);

    await agent.get(`/api/lojas/${f.lojaId}/atendimentos?tipo=VISITA`).expect(400);
  });
});
