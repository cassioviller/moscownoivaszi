import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable, auditLogTable, bloqueioVestidosTable, contratoBloqueiosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-M24 — estado terminal é terminal em TODA porta (rodada 2, ângulo 6).
 *
 * Cinco portas deixavam registro morto aceitar escrita, cada uma com as
 * guardas irmãs já certas ao lado. Este arquivo prega as cinco.
 */
describe("S-M24 — o registro morto não se reescreve", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("6#1 — POST /contratos recusa bloqueio SOFT-CANCELADO como reserva (a venda nascia ATIVA segurando reserva morta)", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    await db.update(bloqueioVestidosTable)
      .set({ canceladoEm: new Date() })
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));

    // VERMELHO ANTES: 201 — e a disponibilidade ignorava o bloqueio, então a
    // mesma peça podia ser prometida a outra noiva para o mesmo fim de semana.
    const r = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
      bloqueioVestidoIds: [bloqueio.id],
    });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("RESERVA_NAO_ENCONTRADA");
  });

  it("6#2 — PATCH reserva → CANCELADA recusa com contrato ATIVO preso, e o cancelamento legítimo deixa TRILHA", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataFutura(90) });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
      reservaId: reserva.id,
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-2),
    });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });

    // VERMELHO ANTES: 200 — a peça da noiva voltava ao mercado com o contrato
    // de R$ 5.000,00 cobrando parcelas, sem nenhuma linha de trilha.
    const preso = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ status: "CANCELADA" });
    expect(preso.status).toBe(409);
    expect(preso.body.error).toBe("RESERVA_COM_CONTRATO");

    // O caminho legítimo (sem contrato) segue aberto — e agora com rastro.
    const leadLivre = await criarLead(f);
    const reservaLivre = await criarReserva(f, { leadId: leadLivre.id, casamentoData: dataFutura(60) });
    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reservaLivre.id}`)
      .send({ status: "CANCELADA" })
      .expect(200);
    const trilha = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.acao, "RESERVA_CANCELADA"),
      eq(auditLogTable.entidadeId, reservaLivre.id),
    ));
    expect(trilha).toHaveLength(1);
  });

  it("6#3 — PATCH em contrato CANCELADO responde 422 (o PDF divergia do que a auditoria congelou)", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 3000, fechadoEm: dataFutura(-3) });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "teste", destinoPago: "manter" })
      .expect(200);

    // VERMELHO ANTES: 200 — cpf, datas e observações gravavam no morto.
    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .send({ observacoes: "reescrevendo o arquivo morto" });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("CONTRATO_NAO_ATIVO");
  });

  it("6#4 — orçamento RECUSADO congela conteúdo: item e desconto respondem 422 ORCAMENTO_RECUSADO", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "ENVIADO" });
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ status: "RECUSADO" })
      .expect(200);

    // VERMELHO ANTES: 201/200 — o registro do não mudava depois do não.
    const item = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "reescrita", quantidade: 1, valorUnitario: 500 });
    expect(item.status).toBe(422);
    expect(item.body.error).toBe("ORCAMENTO_RECUSADO");

    const desconto = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: 100 });
    expect(desconto.status).toBe(422);
    expect(desconto.body.error).toBe("ORCAMENTO_RECUSADO");
  });

  it("6#5 — fechar contrato em lead PERDIDO REVIVE a noiva: etapa CONTRATO_FECHADO e carimbos de perda limpos", async () => {
    const lead = await criarLead(f);
    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ etapa: "PERDIDO", perdidaMotivo: "SEM_RETORNO" })
      .expect(200);

    // VERMELHO ANTES: a conversão contava a venda como perda, e a noiva
    // entrava na janela do expurgo LGPD com contrato ATIVO.
    await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
    }).expect(201);

    const [depois] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(depois!.etapa).toBe("CONTRATO_FECHADO");
    expect(depois!.perdidaEm).toBeNull();
    expect(depois!.perdidaMotivo).toBeNull();
    expect(depois!.contratoFechadoEm).not.toBeNull();
  });
});
