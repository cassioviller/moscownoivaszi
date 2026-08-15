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

/**
 * S-C281 — o `null` que vira 01/01/1970.
 *
 * A S-C232 fechou UM sítio desta classe (as datas de retirada e devolução do
 * diálogo do contrato, que passaram a ser `nullable` no spec). A sobra que
 * sobrou dizia que a classe continuava viva "fora dela", e mediu 916
 * `coerce.date()` no gerado, com 22 na grafia `.optional()`.
 *
 * **A medição corrigiu o enunciado em dois pontos, e os dois pioram o caso:**
 *
 * 1. **São 31 campos, não 22.** A grafia `.optional()` era o grep, não a
 *    classe: `zod.coerce.date()` **obrigatório** aceita `null` do mesmo jeito,
 *    porque quem produz a época é o `new Date(null)` de dentro da coerção, e
 *    ele roda antes de qualquer `.optional()`. A régua abaixo mede por EFEITO
 *    (`safeParse(null)` devolve uma `Date`?) em vez de por grafia — a lição da
 *    S-C180 e da S-C170 aplicada ao spec.
 *
 * 2. **Os obrigatórios são os que doem, porque são os de DINHEIRO.**
 *    `ReceberParcelaBody.recebidoEm` é `required` no spec (`openapi.yaml:7694`)
 *    e o handler o grava cru em `parcelas.recebido_em`
 *    (`contratos.ts:2461`) — o instante pelo qual o caixa realizado DATA a
 *    entrada. Um cliente que mande `null` no lugar de omitir o campo não leva
 *    400: leva 200, e o pagamento entra datado de **01/01/1970**.
 *
 * O que a época faz depois de gravada é o assunto das duas primeiras cenas. A
 * terceira é a régua da classe inteira.
 */
describe("S-C281 — o null que vira 1970", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Um contrato com carnê de uma parcela, pela porta. */
  async function contratoComParcela() {
    const lead = await criarLead(f, { noivaNome: "Noiva da época" });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 1000,
      fechadoEm: new Date(),
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 1, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    const detalhe = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .expect(200);
    return { contrato, parcela: detalhe.body.parcelas[0] };
  }

  it("o pagamento com `recebidoEm: null` NÃO entra datado de 1970", async () => {
    const { contrato, parcela } = await contratoComParcela();

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 1000, recebidoEm: null, formaRecebimento: "PIX" });

    // O `null` não é um gesto nesta porta: quem não sabe a data OMITE o campo,
    // e o spec o exige. A resposta certa é 400 — nunca 200 com a época.
    expect(r.status).toBe(400);

    const detalhe = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .expect(200);
    const depois = detalhe.body.parcelas.find((p: any) => p.id === parcela.id);
    expect(depois.recebidoEm).toBeNull();
  });

  it("o PATCH do contrato com `dataCasamento: null` NÃO grava o casamento em 1970", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva sem reserva" });
    // Um contrato SEM bloqueio vinculado: é onde a guarda de divergência da
    // data não tem com o que comparar, e a época chega ao UPDATE pelo spread.
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 500,
      fechadoEm: new Date(),
    });

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .send({ dataCasamento: null });

    expect(r.status).toBe(400);

    const depois = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`)
      .expect(200);
    expect(depois.body.dataCasamento).toBeNull();
  });
});
