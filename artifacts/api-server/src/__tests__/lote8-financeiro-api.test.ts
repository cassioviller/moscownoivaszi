import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pagamentosTable, pagamentoItensTable, contasPagarTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

describe("Lote 8 — financeiro auditável", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  // O perfil da vendedora não tem o módulo financeiro — os fluxos abaixo usam
  // o superadmin (o gate 403 já é coberto pelo lote 7).
  it("pagar conta persiste pagamento + item com valor/data e marca a conta PAGA", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const conta = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({ tipo: "DESPESA", descricao: "Aluguel", valorPrevisto: 3500, vencimento: dataFutura(5).toISOString() })
      .expect(201);

    const dataPagamento = dataFutura(1).toISOString();
    const paga = await agent
      .post(`/api/lojas/${f.lojaId}/contas-pagar/${conta.body.id}/pagar`)
      .send({ data: dataPagamento, valorPago: 3450.5, forma: "PIX" })
      .expect(200);
    expect(paga.body.status).toBe("PAGA");

    // Trilha de auditoria: item aponta a conta, pagamento carrega valor/data/forma.
    const [item] = await db.select().from(pagamentoItensTable)
      .where(eq(pagamentoItensTable.contaPagarId, conta.body.id));
    expect(item).toBeTruthy();
    expect(item.valor).toBe(3450.5);

    const [pagamento] = await db.select().from(pagamentosTable)
      .where(eq(pagamentosTable.id, item.pagamentoId));
    expect(pagamento.valorPago).toBe(3450.5);
    expect(pagamento.forma).toBe("PIX");
    expect(pagamento.data.toISOString()).toBe(dataPagamento);
  });

  it("pagar a mesma conta duas vezes → 409 e nenhum pagamento extra", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const conta = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({ tipo: "DESPESA", descricao: "Internet", valorPrevisto: 200, vencimento: dataFutura(3).toISOString() })
      .expect(201);

    await agent
      .post(`/api/lojas/${f.lojaId}/contas-pagar/${conta.body.id}/pagar`)
      .send({ data: dataFutura(0).toISOString(), valorPago: 200 })
      .expect(200);
    const repetida = await agent
      .post(`/api/lojas/${f.lojaId}/contas-pagar/${conta.body.id}/pagar`)
      .send({ data: dataFutura(0).toISOString(), valorPago: 200 })
      .expect(409);
    expect(repetida.body.error).toBe("CONTA_JA_PAGA");

    const itens = await db.select().from(pagamentoItensTable)
      .where(eq(pagamentoItensTable.contaPagarId, conta.body.id));
    expect(itens).toHaveLength(1);
  });

  it("salário recorrente persiste usuarioId/valor (antes 500 por colunas fantasma)", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/recorrencias`)
      .send({ tipo: "SALARIO", usuarioId: f.vendedoraId, valor: 2800, diaVencimento: 5 })
      .expect(201);
    expect(criado.body.usuarioId).toBe(f.vendedoraId);
    expect(criado.body.valor).toBe(2800);

    const lista = await agent.get(`/api/lojas/${f.lojaId}/financeiro/recorrencias`).expect(200);
    expect(lista.body.some((s: { id: string }) => s.id === criado.body.id)).toBe(true);
  });

  it("saldo de referência persiste por dia (upsert)", async () => {
    // Conferir o caixa duas vezes no mesmo dia é corrigir o número, não
    // empilhar um segundo saldo — a projeção não saberia qual dos dois usar.
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const dia = "2027-01-15T12:00:00.000-03:00";
    await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/saldos-referencia`)
      .send({ dataReferencia: dia, valor: 10000 })
      .expect(200);
    const atualizado = await agent
      .post(`/api/lojas/${f.lojaId}/financeiro/saldos-referencia`)
      .send({ dataReferencia: dia, valor: 12500 })
      .expect(200);
    expect(atualizado.body.valor).toBe(12500);
    expect(new Date(atualizado.body.dataReferencia).toISOString()).toBe(new Date(dia).toISOString());

    const lista = await agent.get(`/api/lojas/${f.lojaId}/financeiro/saldos-referencia`).expect(200);
    expect(lista.body.filter((s: { valor: number }) => s.valor === 12500)).toHaveLength(1);
  });

  it("saldos de dias diferentes coexistem — é um histórico de âncoras", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    for (const [dia, valor] of [
      ["2027-02-01T12:00:00.000-03:00", 500],
      ["2027-02-02T12:00:00.000-03:00", 800],
    ] as const) {
      await agent
        .post(`/api/lojas/${f.lojaId}/financeiro/saldos-referencia`)
        .send({ dataReferencia: dia, valor })
        .expect(200);
    }
    const lista = await agent.get(`/api/lojas/${f.lojaId}/financeiro/saldos-referencia`).expect(200);
    const valores = lista.body.map((s: { valor: number }) => s.valor);
    expect(valores).toEqual(expect.arrayContaining([500, 800]));
  });

  it("receber parcela persiste valor/data e re-receber → 409", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const contrato = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 1000,
        parcelas: [
          { numero: 0, valorPrevisto: 400, vencimento: dataFutura(10).toISOString() },
          { numero: 1, valorPrevisto: 600, vencimento: dataFutura(40).toISOString() },
        ],
      })
      .expect(201);
    const entrada = contrato.body.parcelas.find((p: { numero: number }) => p.numero === 0);

    const recebidoEm = dataFutura(2).toISOString();
    const recebida = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${entrada.id}/receber`)
      .send({ valorRecebido: 400, recebidoEm, formaRecebimento: "PIX" })
      .expect(200);
    expect(recebida.body.status).toBe("PAGA");
    expect(recebida.body.valorRecebido).toBe(400);
    expect(new Date(recebida.body.recebidoEm).toISOString()).toBe(recebidoEm);

    const repetida = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${entrada.id}/receber`)
      .send({ valorRecebido: 400, recebidoEm, formaRecebimento: "PIX" })
      .expect(409);
    expect(repetida.body.error).toBe("PARCELA_JA_RECEBIDA");
  });

  it("parcela cancelada não pode ser recebida (422)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const contrato = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 500,
        parcelas: [{ numero: 1, valorPrevisto: 500, vencimento: dataFutura(30).toISOString() }],
      })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.body.id}/cancelar`)
      .send({ motivo: "teste" })
      .expect(200);

    const parcela = contrato.body.parcelas[0];
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/receber`)
      .send({ valorRecebido: 500, recebidoEm: dataFutura(1).toISOString() })
      .expect(422);
    expect(res.body.error).toBe("PARCELA_CANCELADA");
  });
});
