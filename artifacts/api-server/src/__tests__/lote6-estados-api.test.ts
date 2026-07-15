import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

describe("Lote 6 — máquina de estados (API)", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function etapaDoLead(id: string): Promise<string> {
    const [lead] = await db.select({ etapa: leadsTable.etapa }).from(leadsTable).where(eq(leadsTable.id, id));
    return lead.etapa;
  }

  it("abrir orçamento avança o lead para ORCAMENTO_ABERTO, aprovar não regride e é idempotente", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f); // NOVO
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId })
      .expect(201);
    expect(await etapaDoLead(lead.id)).toBe("ORCAMENTO_ABERTO");

    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/aprovar`).expect(204);
    // Aprovar não mexe na etapa do lead.
    expect(await etapaDoLead(lead.id)).toBe("ORCAMENTO_ABERTO");

    const detalhe = await agent.get(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}`).expect(200);
    expect(detalhe.body.status).toBe("APROVADO");

    // Aprovar de novo (já APROVADO) → transição inválida.
    const reAprovar = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/aprovar`)
      .expect(422);
    expect(reAprovar.body.error).toBe("TRANSICAO_INVALIDA");
  });

  it("fechar contrato avança o lead para CONTRATO_FECHADO", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 1000 })
      .expect(201);
    expect(await etapaDoLead(lead.id)).toBe("CONTRATO_FECHADO");
  });

  it("reserva só transita por caminhos válidos", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const reserva = await agent
      .post(`/api/lojas/${f.lojaId}/reservas`)
      .send({ leadId: lead.id, casamentoData: dataFutura(30).toISOString() })
      .expect(201);
    const reservaId = reserva.body.id as string;

    // EM_MONTAGEM não pula direto para CONCLUIDA.
    const invalida = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reservaId}`)
      .send({ status: "CONCLUIDA" })
      .expect(422);
    expect(invalida.body.error).toBe("TRANSICAO_INVALIDA");

    await agent.patch(`/api/lojas/${f.lojaId}/reservas/${reservaId}`).send({ status: "CONFIRMADA" }).expect(200);
    await agent.patch(`/api/lojas/${f.lojaId}/reservas/${reservaId}`).send({ status: "CONCLUIDA" }).expect(200);
  });

  it("lead PATCH recusa regressão de etapa e aceita avanço/PERDIDO", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f); // NOVO

    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "ATENDIMENTO_AGENDADO" })
      .expect(200);

    const regressao = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "NOVO" })
      .expect(422);
    expect(regressao.body.error).toBe("TRANSICAO_INVALIDA");

    const perdido = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "PERDIDO" })
      .expect(200);
    expect(perdido.body.etapa).toBe("PERDIDO");
    expect(perdido.body.perdidaEm).toBeTruthy();
  });
});
