import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, contratosTable, parcelasTable, bloqueioVestidosTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarVestido,
  criarReserva,
  criarBloqueio,
  criarOrcamento,
  criarOrcamentoItem,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

// Corpo mínimo de contrato; cada teste sobrepõe o que precisa.
function corpoContrato(f: Fixture, leadId: string, over: Record<string, unknown> = {}) {
  return { leadId, vendedoraId: f.vendedoraId, valorTotal: 1000, ...over };
}

describe("Lote 5 — Contratos íntegros", () => {
  let f: Fixture;
  let outra: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
    outra = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await limparFixture(outra);
    await fecharPool();
  });

  it("recusa contrato a partir de orçamento não aprovado (422) e nada grava", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(corpoContrato(f, lead.id, { orcamentoId: orcamento.id }))
      .expect(422);
    expect(res.body.error).toBe("ORCAMENTO_NAO_APROVADO");

    const gravados = await db.select().from(contratosTable).where(eq(contratosTable.leadId, lead.id));
    expect(gravados).toHaveLength(0);
  });

  it("cria contrato de orçamento aprovado com snapshot dos itens (201)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, descricao: "Vestido Sereia", valorUnitario: 3000 });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, tipo: "AJUSTE", descricao: "Barra", valorUnitario: 200 });

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(corpoContrato(f, lead.id, { orcamentoId: orcamento.id, valorTotal: 3200 }))
      .expect(201);
    expect(criado.body.status).toBe("ATIVO");

    const detalhe = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .expect(200);
    expect(detalhe.body.itens).toHaveLength(2);
    const descricoes = detalhe.body.itens.map((i: { descricao: string }) => i.descricao).sort();
    expect(descricoes).toEqual(["Barra", "Vestido Sereia"]);
  });

  it("com desconto: congela o desconto e o valorTotal líquido bate com itens − desconto (201)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    // Bruto 3200; 10% → líquido 2880. O desconto se perdia no snapshot: o
    // contrato guardava itens brutos (3200) mas valorTotal líquido (2880), e a
    // soma dos itens não fechava com o total na tela e no PDF.
    const orcamento = await criarOrcamento(f, {
      leadId: lead.id,
      status: "APROVADO",
      descontoTipo: "PERCENTUAL",
      descontoValor: 10,
    });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, descricao: "Vestido", valorUnitario: 3000 });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, tipo: "AJUSTE", descricao: "Barra", valorUnitario: 200 });

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(corpoContrato(f, lead.id, { orcamentoId: orcamento.id, valorTotal: 2880 }))
      .expect(201);

    const detalhe = await agent.get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`).expect(200);
    // O desconto ficou congelado no contrato — a linha "Desconto" reconcilia.
    expect(detalhe.body).toMatchObject({ descontoTipo: "PERCENTUAL", descontoValor: 10, valorTotal: 2880 });
  });

  it("com desconto: valorTotal que não bate com itens − desconto é 422", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, {
      leadId: lead.id,
      status: "APROVADO",
      descontoTipo: "VALOR",
      descontoValor: 300,
    });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, descricao: "Vestido", valorUnitario: 3000 });

    // Bruto 3000 − 300 = 2700. Mandar 2880 (o líquido de outro desconto) é erro.
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(corpoContrato(f, lead.id, { orcamentoId: orcamento.id, valorTotal: 2880 }))
      .expect(422);
  });

  it("recusa quando a soma das parcelas difere do valor total (422)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(
        corpoContrato(f, lead.id, {
          valorTotal: 1000,
          parcelas: [
            { numero: 0, valorPrevisto: 400, vencimento: dataFutura(10).toISOString() },
            { numero: 1, valorPrevisto: 500, vencimento: dataFutura(40).toISOString() },
          ],
        }),
      )
      .expect(422);
    expect(res.body.error).toBe("PARCELAS_NAO_BATEM");

    const gravados = await db.select().from(contratosTable).where(eq(contratosTable.leadId, lead.id));
    expect(gravados).toHaveLength(0);
  });

  it("aceita parcelas que somam o total e as persiste (201)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(
        corpoContrato(f, lead.id, {
          valorTotal: 1000,
          parcelas: [
            { numero: 0, valorPrevisto: 400, vencimento: dataFutura(10).toISOString() },
            { numero: 1, valorPrevisto: 600, vencimento: dataFutura(40).toISOString() },
          ],
        }),
      )
      .expect(201);

    const parcelas = await db.select().from(parcelasTable).where(eq(parcelasTable.contratoId, criado.body.id));
    expect(parcelas).toHaveLength(2);
    expect(parcelas.every((p) => p.status === "PREVISTA")).toBe(true);
  });

  it("bloqueia segundo contrato ATIVO para o mesmo lead (409)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);

    await agent.post(`/api/lojas/${f.lojaId}/contratos`).send(corpoContrato(f, lead.id)).expect(201);
    const segundo = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(corpoContrato(f, lead.id))
      .expect(409);
    expect(segundo.body.error).toBe("CONTRATO_ATIVO_DUPLICADO");
  });

  it("recusa lead de outra loja (422)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const leadOutra = await criarLead(outra);

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(corpoContrato(f, leadOutra.id))
      .expect(422);
    expect(res.body.error).toBe("LEAD_INVALIDO");
  });

  it("cancela em transação: parcelas previstas canceladas, paga intacta, vestido liberado e estorno pendente", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = dataFutura(0);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento,
      leadId: lead.id,
      reservaId: reserva.id,
    });

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send(
        corpoContrato(f, lead.id, {
          bloqueioVestidoId: bloqueio.id,
          dataCasamento: casamento.toISOString(),
          valorTotal: 1000,
          parcelas: [
            { numero: 0, valorPrevisto: 400, vencimento: dataFutura(10).toISOString() },
            { numero: 1, valorPrevisto: 600, vencimento: dataFutura(40).toISOString() },
          ],
        }),
      )
      .expect(201);
    const contratoId = criado.body.id as string;

    // Marca a entrada como PAGA para provar que o cancelamento não a toca.
    await db
      .update(parcelasTable)
      .set({ status: "PAGA" })
      .where(and(eq(parcelasTable.contratoId, contratoId), eq(parcelasTable.numero, 0)));

    const cancelado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cancelar`)
      .send({ motivo: "Desistência da noiva" })
      .expect(200);
    expect(cancelado.body.status).toBe("CANCELADO");
    expect(cancelado.body.canceladoEm).toBeTruthy();

    const [contratoDb] = await db.select().from(contratosTable).where(eq(contratosTable.id, contratoId));
    // `comissaoEstornadaEm` marca quando o estorno foi RECONCILIADO num
    // fechamento — não quando o contrato caiu (isso é o canceladoEm). Cancelar
    // o deixa NULL de propósito: é assim que o estorno §6.4 fica PENDENTE para
    // o próximo fechamento abater. Preenchê-lo aqui faria a comissão já paga
    // sobre esta venda nunca voltar.
    expect(contratoDb.canceladoEm).not.toBeNull();
    expect(contratoDb.comissaoEstornadaEm).toBeNull();

    const parcelas = await db.select().from(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
    const paga = parcelas.find((p) => p.numero === 0);
    const prevista = parcelas.find((p) => p.numero === 1);
    expect(paga?.status).toBe("PAGA");
    expect(prevista?.status).toBe("CANCELADA");

    const [bloqueioDb] = await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(bloqueioDb.canceladoEm).not.toBeNull();

    // Vestido liberado: novo bloqueio na mesma data agora é aceito.
    await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios`)
      .send({ vestidoId: vestido.id, tipo: "RESERVA_CASAMENTO", casamentoData: casamento.toISOString(), leadId: lead.id })
      .expect(201);

    // Idempotência: cancelar de novo → 409.
    const recancelar = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cancelar`)
      .send({ motivo: "de novo" })
      .expect(409);
    expect(recancelar.body.error).toBe("CONTRATO_JA_CANCELADO");
  });
});
