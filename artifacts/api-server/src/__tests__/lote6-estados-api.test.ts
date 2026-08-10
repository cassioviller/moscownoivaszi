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

  async function carimboDoLead(id: string): Promise<Date | null> {
    const [lead] = await db.select({ carimbo: leadsTable.contratoFechadoEm })
      .from(leadsTable).where(eq(leadsTable.id, id));
    return lead.carimbo;
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

  /**
   * S16 — o carimbo é efeito do CONTRATO, não do avanço da etapa.
   *
   * O funil aceita pular (`transicaoLeadValida` só exige `iPara > iDe`), e a
   * noiva que já está EM_PROVAS quando o contrato é registrado não avança etapa
   * nenhuma: `avancarEtapaLead` devolve a mesma, o `if` não entra, e
   * `contrato_fechado_em` fica `null` para sempre. Quem lê isso é o
   * `comContrato` de `/leads/sazonalidade`, que filtra por `is not null`.
   */
  it("fechar contrato carimba a data mesmo quando a etapa não avança (S16)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f); // NOVO

    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "EM_PROVAS" })
      .expect(200);
    expect(await carimboDoLead(lead.id)).toBeNull();

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 1000 })
      .expect(201);

    // A etapa NÃO regride — quem já está em provas continua em provas.
    expect(await etapaDoLead(lead.id)).toBe("EM_PROVAS");
    expect(await carimboDoLead(lead.id)).toBeInstanceOf(Date);
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

    // Perder sem motivo não passa mais: o dado estruturado só vale se for
    // sempre coletado.
    const semMotivo = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "PERDIDO" })
      .expect(422);
    expect(semMotivo.body.error).toBe("MOTIVO_OBRIGATORIO");

    const perdido = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "PERDIDO", perdidaMotivo: "PRECO", perdidaDetalhe: "Acima do teto da noiva" })
      .expect(200);
    expect(perdido.body.etapa).toBe("PERDIDO");
    expect(perdido.body.perdidaEm).toBeTruthy();
    expect(perdido.body.perdidaMotivo).toBe("PRECO");
    expect(perdido.body.perdidaDetalhe).toBe("Acima do teto da noiva");
  });

  it("reviver lead perdido preserva o motivo como histórico; motivo fora do PERDIDO é ignorado", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);

    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "PERDIDO", perdidaMotivo: "SEM_RETORNO" })
      .expect(200);

    // Ela voltou! A etapa anda, mas o registro de por que se perdeu fica —
    // mesmo espírito do carimbo perdidaEm.
    const revivido = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "ATENDIMENTO_AGENDADO" })
      .expect(200);
    expect(revivido.body.etapa).toBe("ATENDIMENTO_AGENDADO");
    expect(revivido.body.perdidaMotivo).toBe("SEM_RETORNO");

    // Motivo mandado numa transição que não é perda: ignorado, não gravado.
    const comMotivoSolto = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "EM_ATENDIMENTO", perdidaMotivo: "CONCORRENTE" })
      .expect(200);
    expect(comMotivoSolto.body.perdidaMotivo).toBe("SEM_RETORNO");
  });
});
