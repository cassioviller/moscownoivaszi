import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import {
  criarContrato,
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { diaDeNegocio } from "@workspace/financeiro-core";

/**
 * E100/F36 — "quanto falta" e "quando é a próxima".
 *
 * O portal listava oito parcelas num celular e não somava. As duas perguntas
 * estavam a uma soma de distância, e cada uma voltava como mensagem de WhatsApp
 * para a vendedora — o custo exato que o E78 existia para reduzir.
 */
describe("E100 — o portal responde quanto falta e quando é a próxima", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const publico = () => request(app);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma noiva com portal vivo e um carnê de três parcelas. */
  async function noivaComCarne() {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: dataFutura(-5),
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 3, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);

    const portal = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);
    return { lead, contrato, token: portal.body.token as string };
  }

  it("sem nada recebido, falta pagar é o carnê inteiro e a próxima é a primeira", async () => {
    const { token } = await noivaComCarne();

    const r = await publico().get(`/api/portal?token=${token}`).expect(200);

    expect(r.body.resumoPagamento.faltaPagar).toBe(3000);
    expect(r.body.resumoPagamento.proximaValor).toBe(1000);
    expect(diaDeNegocio(new Date(r.body.resumoPagamento.proximaEm))).toBe(
      diaDeNegocio(dataFutura(10)),
    );
  });

  it("a parcela PARCIAL desconta o que já entrou — nunca cobra de novo na tela dela", async () => {
    const { token, contrato } = await noivaComCarne();
    const parcelas = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .expect(200);
    const primeira = parcelas.body.parcelas.sort((a: any, b: any) => a.numero - b.numero)[0];

    // Metade da primeira parcela.
    await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${primeira.id}/receber`)
      .send({ valorRecebido: 400, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);

    const r = await publico().get(`/api/portal?token=${token}`).expect(200);

    // 3000 − 400: a PARCIAL entra pelo SALDO, não pelo previsto cheio.
    expect(r.body.resumoPagamento.faltaPagar).toBe(2600);
    // E ela continua sendo a próxima, valendo o que falta.
    expect(r.body.resumoPagamento.proximaValor).toBe(600);
  });

  it("quitado o carnê, falta pagar é zero e não há próxima", async () => {
    const { token, contrato } = await noivaComCarne();
    const detalhe = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(200);

    for (const p of detalhe.body.parcelas) {
      await agent
        .post(`/api/lojas/${f.lojaId}/parcelas/${p.id}/receber`)
        .send({
          valorRecebido: p.valorPrevisto,
          recebidoEm: new Date().toISOString(),
          formaRecebimento: "PIX",
        })
        .expect(200);
    }

    const r = await publico().get(`/api/portal?token=${token}`).expect(200);
    expect(r.body.resumoPagamento.faltaPagar).toBe(0);
    expect(r.body.resumoPagamento.proximaEm).toBeNull();
  });

  it("sem contrato, o resumo é null — e não um 'falta pagar R$ 0,00' sobre acordo nenhum", async () => {
    const lead = await criarLead(f);
    const portal = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);

    const r = await publico().get(`/api/portal?token=${portal.body.token}`).expect(200);
    expect(r.body.resumoPagamento).toBeNull();
  });
});
