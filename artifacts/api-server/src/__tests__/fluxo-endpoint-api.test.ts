import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, parcelasTable, pagamentosTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  criarContrato,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E79 — o fluxo agregado no banco. Os MESMOS motores do financeiro-core (E25)
 * rodam no servidor sobre linhas filtradas por data. Os invariantes que a
 * tela sempre exibiu viram asserção: porMeio.total === resumo.entradas, e o
 * movimento de entrada sabe a noiva sem a tela rebuscar contratos.
 */
describe("GET /financeiro/fluxo (E79)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadNome: string;

  const hoje = new Date();
  const ymd = (d: Date) => {
    const local = new Date(d.getTime() - 3 * 3_600_000);
    return local.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    leadNome = lead.noivaNome;
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: hoje,
    });

    await db.insert(parcelasTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        valorPrevisto: 1000,
        vencimento: hoje,
        status: "PAGA",
        valorRecebido: 1000,
        recebidoEm: hoje,
        formaRecebimento: "PIX",
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 2,
        valorPrevisto: 800,
        vencimento: hoje,
        status: "PARCIAL",
        valorRecebido: 300,
        recebidoEm: hoje,
        formaRecebimento: "DINHEIRO",
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 3,
        valorPrevisto: 1200,
        vencimento: dataFutura(30),
        status: "PREVISTA",
      },
    ]);
    await db.insert(pagamentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      data: hoje,
      valorPago: 250,
    });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("resumo, porMeio, movimentos e horizonte fecham entre si", async () => {
    const dia = ymd(hoje);
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/fluxo?ini=${dia}&fim=${dia}`)
      .expect(200);

    const { resumo, porMeio, movimentos, horizonte, tendencia } = res.body;

    // Entradas = 1000 (PIX) + 300 (parcial em dinheiro); saída = 250.
    expect(resumo.entradas).toBe(1300);
    expect(resumo.saidas).toBe(250);
    expect(resumo.saldo).toBe(1050);

    // O invariante do E50: o MESMO dinheiro, por construção.
    expect(porMeio.total).toBe(resumo.entradas);
    const pix = porMeio.linhas.find((l: { forma: string | null }) => l.forma === "PIX");
    expect(pix.total).toBe(1000);

    // A noiva vem no movimento — a tela parou de rebuscar contratos.
    const entrada = movimentos.find((m: { tipo: string }) => m.tipo === "ENTRADA");
    expect(entrada.rotulo).toBe(leadNome);
    expect(entrada.contratoId).toBeTruthy();
    expect(movimentos).toHaveLength(3);

    // Horizonte: só o aberto — a PREVISTA de 1200 + o resto da PARCIAL (500).
    expect(horizonte.aReceber).toBe(1700);

    // A tendência cobre a competência corrente e o mês fecha com o resumo.
    const compHoje = dia.slice(0, 7);
    const ponto = tendencia.find((t: { competencia: string }) => t.competencia === compHoje);
    expect(ponto.entradas).toBeGreaterThanOrEqual(1300);
  });

  it("sem ini/fim cai no mês corrente", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/financeiro/fluxo`).expect(200);
    expect(res.body.intervalo.iniYMD.endsWith("-01")).toBe(true);
    expect(res.body.resumo.entradas).toBe(1300);
  });
});
