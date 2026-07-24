import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Lote 20 — E10: trilha de auditoria (audit_log).
 * Cada ação sensível do financeiro grava quem/o quê/quando NA MESMA transação;
 * o GET /financeiro/auditoria devolve a linha do tempo da loja.
 */
describe("Lote 20 — trilha de auditoria", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  const linhasDe = (acao: string) =>
    db.select().from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.acao, acao)));

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("receber e estornar parcela deixam linha com autor e valores", async () => {
    const lead = await criarLead(f);
    const contrato = await admin
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 1000,
        parcelas: [{ numero: 0, valorPrevisto: 1000, vencimento: dataFutura(10).toISOString() }],
      })
      .expect(201);
    const entrada = contrato.body.parcelas[0];

    await admin
      .post(`/api/lojas/${f.lojaId}/parcelas/${entrada.id}/receber`)
      .send({ valorRecebido: 1000, recebidoEm: dataFutura(1).toISOString(), formaRecebimento: "PIX" })
      .expect(200);

    const [recebida] = await linhasDe("PARCELA_RECEBIDA");
    expect(recebida).toBeTruthy();
    expect(recebida.entidade).toBe("parcela");
    expect(recebida.entidadeId).toBe(entrada.id);
    expect(recebida.usuarioNome).toContain("Super Admin Teste");
    expect((recebida.detalhe as { valorRecebido: number }).valorRecebido).toBe(1000);

    await admin.post(`/api/lojas/${f.lojaId}/parcelas/${entrada.id}/estornar`).expect(200);
    const [estornada] = await linhasDe("RECEBIMENTO_ESTORNADO");
    expect(estornada).toBeTruthy();
    // O estorno zera a parcela — o valor desfeito sobrevive na trilha.
    expect((estornada.detalhe as { valorRecebido: number }).valorRecebido).toBe(1000);
  });

  it("pagar conta, pagamento multi e estorno deixam linha (estorno é o único rastro do pagamento deletado)", async () => {
    const conta = await admin
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({ tipo: "DESPESA", descricao: "Aluguel auditado", valorPrevisto: 500, vencimento: dataFutura(5).toISOString() })
      .expect(201);
    await admin
      .post(`/api/lojas/${f.lojaId}/contas-pagar/${conta.body.id}/pagar`)
      .send({ data: dataFutura(1).toISOString(), valorPago: 500, forma: "PIX" })
      .expect(200);
    const [paga] = await linhasDe("CONTA_PAGA");
    expect(paga.entidadeId).toBe(conta.body.id);

    const c1 = await admin
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({ tipo: "DESPESA", descricao: "Luz", valorPrevisto: 100, vencimento: dataFutura(6).toISOString() })
      .expect(201);
    const c2 = await admin
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({ tipo: "DESPESA", descricao: "Água", valorPrevisto: 60, vencimento: dataFutura(6).toISOString() })
      .expect(201);
    const pagamento = await admin
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ contaIds: [c1.body.id, c2.body.id], data: dataFutura(2).toISOString() })
      .expect(201);
    const [registrado] = await linhasDe("PAGAMENTO_REGISTRADO");
    expect(registrado.entidadeId).toBe(pagamento.body.id);
    expect((registrado.detalhe as { contas: unknown[] }).contas).toHaveLength(2);

    await admin
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos/${pagamento.body.id}/estornar`)
      .expect(204);
    const [estornado] = await linhasDe("PAGAMENTO_ESTORNADO");
    expect(estornado.entidadeId).toBe(pagamento.body.id);
    expect((estornado.detalhe as { valorPago: number }).valorPago).toBe(160);
  });

  it("GET /financeiro/auditoria lista mais recentes primeiro; vendedora sem módulo → 403", async () => {
    const res = await admin.get(`/api/lojas/${f.lojaId}/financeiro/auditoria`).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    const instantes = res.body.map((l: { criadoEm: string }) => new Date(l.criadoEm).getTime());
    const ordenado = [...instantes].sort((a, b) => b - a);
    expect(instantes).toEqual(ordenado);

    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora.get(`/api/lojas/${f.lojaId}/financeiro/auditoria`).expect(403);
  });
});
