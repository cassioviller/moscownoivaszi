import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, atendimentosTable, cabinesTable, parcelasTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarContrato,
  criarLead,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E125 (D3/D4) — a ficha responde o telefone.
 *
 * D3: a ficha da noiva precisa da agenda DELA — `GET /atendimentos` sabia
 * recortar por bloqueio, tipo e janela, mas não por noiva; a ficha teria de
 * baixar a agenda da loja inteira para achar a prova de uma pessoa (a classe
 * que o E62 fechou em orçamentos e contratos).
 *
 * D4: o saldo devedor por contrato pede as parcelas — o recorte `?leadId=`
 * da ficha passa a embuti-las. A listagem GERAL continua sem (a lição da
 * S-D5/S-D16: payload que ninguém lê não desce; 518 contratos × parcelas
 * não entram no acervo paginado).
 */
describe("A ficha responde o telefone (E125)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let leadA: string;
  let leadB: string;
  let provaDeA: string;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);

    const a = await criarLead(f);
    const b = await criarLead(f);
    leadA = a.id;
    leadB = b.id;

    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine E125" });
    // Dias distintos: a cabine tem unique (cabineId, inicio).
    let dia = 7;
    const atendimento = (leadId: string, tipo: "ATENDIMENTO" | "PROVA") => ({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo,
      inicio: dataFutura(dia++),
    });
    const prova = atendimento(leadA, "PROVA");
    provaDeA = prova.id;
    await db.insert(atendimentosTable).values([
      prova,
      atendimento(leadA, "ATENDIMENTO"),
      atendimento(leadB, "PROVA"),
    ]);

    // O caso do D4: contrato de R$ 8.400,00, entrada + 3 parcelas recebidas,
    // R$ 5.880,00 em aberto. As parcelas descem no recorte da ficha.
    const contrato = await criarContrato(f, {
      leadId: leadA,
      valorTotal: 8400,
      fechadoEm: new Date("2026-01-10T15:00:00-03:00"),
    });
    const recebida = (numero: number, venc: number) => ({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero,
      valorPrevisto: 840,
      vencimento: dataFutura(venc),
      status: "PAGA" as const,
      valorRecebido: 840,
      recebidoEm: new Date("2026-02-01T15:00:00-03:00"),
    });
    const aberta = (numero: number, venc: number) => ({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero,
      valorPrevisto: 840,
      vencimento: dataFutura(venc),
      status: "PREVISTA" as const,
    });
    await db.insert(parcelasTable).values([
      recebida(0, 1),
      recebida(1, 30),
      recebida(2, 60),
      recebida(3, 90),
      aberta(4, 120),
      aberta(5, 150),
      aberta(6, 180),
      aberta(7, 210),
      aberta(8, 240),
      aberta(9, 270),
      aberta(10, 300),
    ]);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("atendimentos?leadId= devolve só a agenda da noiva", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?leadId=${leadA}`)
      .expect(200);
    const ids = res.body.map((a: { id: string }) => a.id);
    expect(res.body).toHaveLength(2);
    expect(ids).toContain(provaDeA);
    expect(res.body.every((a: { leadId: string }) => a.leadId === leadA)).toBe(true);
  });

  it("o recorte por noiva compõe com os demais (tipo=PROVA)", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos?leadId=${leadA}&tipo=PROVA`)
      .expect(200);
    expect(res.body.map((a: { id: string }) => a.id)).toEqual([provaDeA]);
  });

  it("contratos?leadId= embute as parcelas — e o aberto soma R$ 5.880,00", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/contratos?leadId=${leadA}`)
      .expect(200);
    expect(res.body.itens).toHaveLength(1);
    const parcelas = res.body.itens[0].parcelas as
      | { status: string; valorPrevisto: number; valorRecebido: number | null }[]
      | undefined;
    expect(parcelas).toBeDefined();
    expect(parcelas).toHaveLength(11);
    const abertoC = parcelas!
      .filter((p) => p.status === "PREVISTA" || p.status === "PARCIAL")
      .reduce((s, p) => s + Math.round(p.valorPrevisto * 100) - Math.round((p.valorRecebido ?? 0) * 100), 0);
    expect(abertoC).toBe(588000);
  });

  it("a listagem geral segue SEM parcelas — o acervo paginado não carrega o carnê", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/contratos`).expect(200);
    const doLeadA = res.body.itens.find((c: { leadId: string }) => c.leadId === leadA);
    expect(doLeadA).toBeDefined();
    expect(doLeadA.parcelas).toBeUndefined();
  });
});
