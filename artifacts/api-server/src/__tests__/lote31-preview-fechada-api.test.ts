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
 * E26: o preview de competência FECHADA responde da memória do fechamento
 * (imutável), não de um recálculo ao vivo. A prova: um contrato lançado
 * retroativamente DEPOIS do fecho não muda a resposta — o recálculo mudaria.
 */

function competenciaAtras(n: number): string {
  const agora = new Date();
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

describe("Comissões — preview de competência fechada (E26)", () => {
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

  const preview = (competencia: string) =>
    ag.get(`/api/lojas/${f.lojaId}/comissao/preview?competencia=${competencia}`);

  it("fechada responde do fechamento — contrato retroativo não muda o número", async () => {
    const comp = competenciaAtras(2);
    await db.insert(comissaoFechamentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      vendedoraId: f.vendedoraId,
      competencia: comp,
      totalVendas: 12000,
      percentualAplicado: 5,
      valorComissao: 600,
      valorBonus: 0,
      valorTotal: 600,
    });

    // Retroativo pós-fecho: o recálculo ao vivo somaria estes 50000 na base.
    const lead = await criarLead(f);
    await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 50000,
      fechadoEm: new Date(`${comp}-15T12:00:00-03:00`),
    });

    const res = await preview(comp).expect(200);
    expect(res.headers["cache-control"]).toContain("max-age=3600");
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      vendedoraId: f.vendedoraId,
      totalVendas: 12000,
      valorTotal: 600,
      estornoPendente: 0,
      faltaProximoDegrau: null,
    });
  });

  it("competência sem fechamento segue ao vivo (o retroativo aparece)", async () => {
    const compAberta = competenciaAtras(1);
    const lead = await criarLead(f);
    await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 7000,
      fechadoEm: new Date(`${compAberta}-10T12:00:00-03:00`),
    });

    const res = await preview(compAberta).expect(200);
    const linha = res.body.find((l: { vendedoraId: string }) => l.vendedoraId === f.vendedoraId);
    expect(linha.totalVendas).toBe(7000);
    expect(res.headers["cache-control"] ?? "").not.toContain("max-age=3600");
  });
});
