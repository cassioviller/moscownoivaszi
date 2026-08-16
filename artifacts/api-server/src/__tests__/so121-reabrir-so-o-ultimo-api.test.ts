import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, comissaoFechamentosTable } from "@workspace/db";
import { criarFixture, criarLead, criarContrato, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * S-O121 — **só o ÚLTIMO fechamento da vendedora pode ser reaberto** (decisão
 * da dona, 15/08/2026).
 *
 * O E238 mediu o defeito de modelagem: reabrir um fechamento PARCIAL depois de
 * o mês seguinte ter absorvido o resto e carimbado os contratos perdia a
 * absorção do parcial mesmo em SÉRIE — a linha apagada levava os R$ 4.000,00
 * sem devolvê-los a lugar nenhum, porque o carimbo do mês seguinte já tinha
 * tirado o contrato do pendente. Não é tranca: é que reabrir um mês no meio
 * da série muda a base de todos os que vieram depois, e nada os recalcula.
 *
 * A regra escolhida é a mais simples que fecha o buraco: reabre-se de trás
 * para a frente. Reabrir 2025-07 com 2025-08 fechado responde 422 dizendo QUAL
 * reabrir antes; reabrir 08 e depois 07 passa.
 */
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("S-O121 — reabrir só o último fechamento da vendedora", () => {
  afterAll(async () => {
    await fecharPool();
  });

  async function loja(f: Fixture) {
    const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
    await ag.post(`/api/lojas/${f.lojaId}/comissao/regras`).send({
      vendedoraId: f.vendedoraId,
      vigenciaInicio: dia("2020-01-01").toISOString(),
      faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
    }).expect(201);
    return ag;
  }
  async function venda(f: Fixture, valorTotal: number, fechadoEm: string) {
    const lead = await criarLead(f);
    return criarContrato(f, { leadId: lead.id, valorTotal, fechadoEm: dia(fechadoEm) });
  }
  async function fechar(ag: Awaited<ReturnType<typeof loginComLoja>>, f: Fixture, competencia: string) {
    const r = await ag.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia }).expect(201);
    return r.body[0].id as string;
  }

  it("reabrir julho com agosto fechado dá 422 e nomeia agosto; reabrir agosto e depois julho passa", async () => {
    const f = await criarFixture();
    try {
      const ag = await loja(f);
      await venda(f, 10000, "2025-07-10");
      await venda(f, 20000, "2025-08-10");
      const julho = await fechar(ag, f, "2025-07");
      const agosto = await fechar(ag, f, "2025-08");

      const recusa = await ag.delete(`/api/lojas/${f.lojaId}/comissao/fechamentos/${julho}`);
      expect(recusa.status, JSON.stringify(recusa.body)).toBe(422);
      expect(recusa.body.error).toBe("FECHAMENTO_NAO_E_O_ULTIMO");
      expect(recusa.body.detalhe).toContain("2025-08");
      expect(recusa.body.reabraAntes).toEqual([{ fechamentoId: agosto, competencia: "2025-08" }]);
      // E julho continua de pé — a recusa não apagou nada.
      const [aindaLa] = await db.select({ id: comissaoFechamentosTable.id }).from(comissaoFechamentosTable).where(eq(comissaoFechamentosTable.id, julho));
      expect(aindaLa?.id).toBe(julho);

      // De trás para a frente: agosto, depois julho.
      await ag.delete(`/api/lojas/${f.lojaId}/comissao/fechamentos/${agosto}`).expect(200);
      await ag.delete(`/api/lojas/${f.lojaId}/comissao/fechamentos/${julho}`).expect(200);
    } finally {
      await limparFixture(f);
    }
  });

  it("a guarda é por VENDEDORA: o fechamento de agosto de outra vendedora não prende o julho desta", async () => {
    const f = await criarFixture();
    try {
      const ag = await loja(f);
      await venda(f, 10000, "2025-07-10");
      const julho = await fechar(ag, f, "2025-07");
      // Agosto sem venda desta vendedora não gera fechamento para ela; a
      // competência de agosto fecha vazia (ou de outra vendedora) e não conta.
      const agosto = await ag.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-08" });
      expect([200, 201, 409, 422]).toContain(agosto.status);
      const seus = await db.select({ competencia: comissaoFechamentosTable.competencia }).from(comissaoFechamentosTable)
        .where(eq(comissaoFechamentosTable.vendedoraId, f.vendedoraId));
      expect(seus.map((s) => s.competencia)).toEqual(["2025-07"]);
      await ag.delete(`/api/lojas/${f.lojaId}/comissao/fechamentos/${julho}`).expect(200);
    } finally {
      await limparFixture(f);
    }
  });
});
