import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, comissaoRegrasTable, comissaoFaixasTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  criarLead,
  criarContrato,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Lote 21 — E11: minha comissão.
 * A vendedora (SEM o módulo comissao — o perfil da fixture não o tem) vê o
 * próprio extrato; a rota de gestão continua 403 para ela. O filtro é a
 * sessão: não existe parâmetro de vendedora para adulterar.
 */
describe("Lote 21 — minha comissão", () => {
  let f: Fixture;
  let vendedora: Awaited<ReturnType<typeof loginComLoja>>;
  const competencia = "2026-05"; // passada: fechamento aceitaria, e o mês é estável

  beforeAll(async () => {
    f = await criarFixture();
    vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);

    // Escada: 5% até 10k, 8% dali em diante (vigência antes da competência).
    const regraId = randomUUID();
    await db.insert(comissaoRegrasTable).values({
      id: regraId,
      lojaId: f.lojaId,
      vendedoraId: f.vendedoraId,
      vigenciaInicio: new Date("2026-01-01T12:00:00-03:00"),
      bonusAcumulaFaixas: false,
      ativo: true,
    });
    await db.insert(comissaoFaixasTable).values([
      { id: randomUUID(), lojaId: f.lojaId, regraId, minAcumulado: 0, maxAcumulado: 10000, percentual: 5, bonusFixo: 0 },
      { id: randomUUID(), lojaId: f.lojaId, regraId, minAcumulado: 10000, maxAcumulado: null, percentual: 8, bonusFixo: 0 },
    ]);

    // 6k vendidos na competência pela vendedora; venda de OUTRA pessoa no
    // mesmo mês não pode vazar para o extrato dela.
    const lead = await criarLead(f);
    await criarContrato(f, { leadId: lead.id, valorTotal: 6000, fechadoEm: new Date("2026-05-10T12:00:00-03:00") });
    const leadAlheio = await criarLead(f);
    await criarContrato(f, {
      leadId: leadAlheio.id,
      vendedoraId: f.superAdminId,
      valorTotal: 50000,
      fechadoEm: new Date("2026-05-12T12:00:00-03:00"),
    });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("vendedora sem módulo comissao vê o próprio extrato (e só o próprio)", async () => {
    const res = await vendedora
      .get(`/api/lojas/${f.lojaId}/minha-comissao?competencia=${competencia}`)
      .expect(200);
    expect(res.body.temRegra).toBe(true);
    expect(res.body.totalVendas).toBe(6000); // os 50k alheios não vazam
    expect(res.body.percentualAplicado).toBe(5);
    expect(res.body.valorComissao).toBe(300);
    expect(res.body.valorTotal).toBe(300);
    // Faltam 4k para a faixa de 8%.
    expect(res.body.faltaProximoDegrau).toBe(4000);
    expect(res.body.proximoDegrauPercentual).toBe(8);
    expect(res.body.fechamentos).toEqual([]);
  });

  it("a gestão continua fechada: preview → 403 para a vendedora", async () => {
    await vendedora
      .get(`/api/lojas/${f.lojaId}/comissao/preview?competencia=${competencia}`)
      .expect(403);
  });

  it("mês sem regra vigente: temRegra=false e valores zerados, não 500", async () => {
    const res = await vendedora
      .get(`/api/lojas/${f.lojaId}/minha-comissao?competencia=2025-01`)
      .expect(200);
    expect(res.body.temRegra).toBe(false);
    expect(res.body.valorTotal).toBe(0);
    expect(res.body.faltaProximoDegrau).toBeNull();
  });

  it("competência inválida → 400", async () => {
    await vendedora
      .get(`/api/lojas/${f.lojaId}/minha-comissao?competencia=maio-2026`)
      .expect(400);
  });
});
