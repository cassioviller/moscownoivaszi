import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, comissaoFechamentosTable } from "@workspace/db";
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
 * Simulador de escada (E23): a escada hipotética sobre as bases REAIS, pelo
 * mesmo motor do fechamento. Mês fechado usa base e pago do fechamento; mês
 * sem fechamento usa as vendas brutas. Nada é gravado.
 */

/** Competência `n` meses antes da corrente. */
function competenciaAtras(n: number): string {
  const agora = new Date();
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Meio do mês da competência — contrato fechado dentro dela, longe das bordas. */
function meioDaCompetencia(comp: string): Date {
  return new Date(`${comp}-15T12:00:00-03:00`);
}

describe("Comissões — simulador de escada (E23)", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    ag = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const simular = (corpo: Record<string, unknown>) =>
    ag.post(`/api/lojas/${f.lojaId}/comissao/simular`).send(corpo);

  it("mês fechado compara com o fechamento; mês aberto recalcula das vendas brutas", async () => {
    const lead1 = await criarLead(f);
    const lead2 = await criarLead(f);
    const compFechada = competenciaAtras(2);
    const compAberta = competenciaAtras(1);

    // Mês "fechado": fechamento diz base 10000 pago 500 (5%).
    await db.insert(comissaoFechamentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      vendedoraId: f.vendedoraId,
      competencia: compFechada,
      totalVendas: 10000,
      percentualAplicado: 5,
      valorComissao: 500,
      valorBonus: 0,
      valorTotal: 500,
    });
    // Mês sem fechamento: uma venda de 8000; sem regra vigente → pago real 0.
    await criarContrato(f, {
      leadId: lead1.id,
      valorTotal: 8000,
      fechadoEm: meioDaCompetencia(compAberta),
    });
    // Venda no mês CORRENTE não entra (o simulador olha só meses anteriores).
    await criarContrato(f, {
      leadId: lead2.id,
      valorTotal: 99999,
      fechadoEm: new Date(),
    });

    const res = await simular({
      vendedoraId: f.vendedoraId,
      faixas: [{ minAcumulado: 0, percentual: 10 }],
      meses: 3,
    }).expect(200);

    expect(res.body.linhas).toHaveLength(3);
    const fechada = res.body.linhas.find((l: { competencia: string }) => l.competencia === compFechada);
    expect(fechada).toMatchObject({ fechada: true, base: 10000, pagoReal: 500, simulado: 1000, diferenca: 500 });

    const aberta = res.body.linhas.find((l: { competencia: string }) => l.competencia === compAberta);
    expect(aberta).toMatchObject({ fechada: false, base: 8000, pagoReal: 0, simulado: 800, diferenca: 800 });

    expect(res.body.totalSimulado).toBe(1800);
    expect(res.body.totalDiferenca).toBe(1300);

    // Não grava nada: continua existindo só o fechamento semeado.
    const fechs = await db.select().from(comissaoFechamentosTable);
    expect(fechs.filter((x) => x.lojaId === f.lojaId)).toHaveLength(1);
  });

  it("escada inválida é 422 com motivo; vendedora de fora é 422", async () => {
    const res = await simular({
      vendedoraId: f.vendedoraId,
      faixas: [
        { minAcumulado: 0, maxAcumulado: 5000, percentual: 5 },
        { minAcumulado: 4000, percentual: 8 }, // sobrepõe
      ],
    }).expect(422);
    expect(res.body.error).toBe("FAIXAS_INVALIDAS");

    await simular({
      vendedoraId: randomUUID(),
      faixas: [{ minAcumulado: 0, percentual: 10 }],
    }).expect(422);
  });
});
