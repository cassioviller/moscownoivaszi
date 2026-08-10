import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  parcelasTable,
  contratosTable,
  contasPagarTable,
  auditLogTable,
  comissaoFechamentosTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  criarContrato,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E94 — os caminhos pelos quais o dinheiro mudava sem deixar rastro.
 *
 * B3: cancelar contrato é a maior ação de dinheiro do sistema (anula o que
 * falta e, com `destinoPago: "estornar"`, tira da receita o que já entrou) e
 * era a única sem uma linha de trilha — enquanto a ação irmã e MENOR, estornar
 * UMA parcela, sempre gravou.
 *
 * B8: `DELETE /contas-pagar/:id` apagava a conta de COMISSAO nascida de um
 * fechamento. A FK `comissao_fechamentos.conta_pagar_id` é ON DELETE SET NULL,
 * então o vínculo sumia calado: a vendedora não recebia, `pendencias` não
 * acusava (o fechamento continua existindo, a competência segue "fechada") e
 * reabrir não reparava, porque as duas guardas do reabrir dependem de
 * `contaPagarId` não ser nulo.
 */

describe("E94 — dinheiro que muda sem deixar rastro", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterEach(async () => {
    await db.delete(auditLogTable).where(eq(auditLogTable.lojaId, f.lojaId));
    await db.delete(comissaoFechamentosTable).where(eq(comissaoFechamentosTable.lojaId, f.lojaId));
    await db.delete(parcelasTable).where(eq(parcelasTable.lojaId, f.lojaId));
    await db.delete(contratosTable).where(eq(contratosTable.lojaId, f.lojaId));
    await db.delete(contasPagarTable).where(eq(contasPagarTable.lojaId, f.lojaId));
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const trilha = async (acao: string) =>
    db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.acao, acao)));

  /** Contrato com uma parcela quitada e uma em aberto — 1.000 de 3.000. */
  async function contratoComRecebimento(): Promise<string> {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3_000,
      fechadoEm: new Date(),
    });
    await db.insert(parcelasTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 0,
        valorPrevisto: 1_000,
        vencimento: new Date(),
        status: "PAGA",
        valorRecebido: 1_000,
        recebidoEm: new Date(),
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        valorPrevisto: 2_000,
        vencimento: new Date(),
        status: "PREVISTA",
      },
    ]);
    return contrato.id;
  }

  const cancelar = (contratoId: string, destinoPago: "manter" | "estornar") =>
    agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cancelar`)
      .send({ motivo: "Noiva desistiu do casamento", destinoPago });

  describe("B3 — cancelar contrato deixa trilha", () => {
    it("o estorno em massa grava CONTRATO_CANCELADO com o que foi desfeito", async () => {
      const contratoId = await contratoComRecebimento();

      await cancelar(contratoId, "estornar").expect(200);

      const linhas = await trilha("CONTRATO_CANCELADO");
      expect(linhas).toHaveLength(1);
      const detalhe = linhas[0].detalhe as Record<string, unknown>;
      expect(linhas[0].entidade).toBe("contrato");
      expect(linhas[0].entidadeId).toBe(contratoId);
      // O motivo digitado morria no contrato, invisível para a trilha e para o
      // CSV da contadora.
      expect(detalhe.motivo).toBe("Noiva desistiu do casamento");
      expect(detalhe.destinoPago).toBe("estornar");
      // Os R$ 1.000 que saíram da receita — o número que ninguém conseguia
      // reconstituir depois, porque o `valorRecebido` já tinha sido zerado.
      expect(detalhe.totalEstornado).toBe(1_000);
      expect(detalhe.parcelasEstornadas).toBe(1);
      // E os R$ 2.000 que deixaram de ser cobráveis.
      expect(detalhe.totalAnulado).toBe(2_000);
      expect(detalhe.parcelasAnuladas).toBe(1);
    });

    it("cancelar MANTENDO o pago também grava — e diz que não estornou nada", async () => {
      const contratoId = await contratoComRecebimento();

      await cancelar(contratoId, "manter").expect(200);

      const linhas = await trilha("CONTRATO_CANCELADO");
      expect(linhas).toHaveLength(1);
      const detalhe = linhas[0].detalhe as Record<string, unknown>;
      expect(detalhe.destinoPago).toBe("manter");
      // A distinção que a trilha precisa preservar: o dinheiro ENTROU e FICOU.
      expect(detalhe.totalRecebido).toBe(1_000);
      expect(detalhe.totalEstornado).toBe(0);
    });

    it("a trilha é atômica com a ação: contrato já cancelado não grava linha nova", async () => {
      const contratoId = await contratoComRecebimento();
      await cancelar(contratoId, "manter").expect(200);

      await cancelar(contratoId, "estornar").expect(409);

      expect(await trilha("CONTRATO_CANCELADO")).toHaveLength(1);
    });

    it("a parcela PARCIAL não sobrevive ao cancelamento", async () => {
      // E94: o UPDATE das abertas dizia `status = 'PREVISTA'`, a mesma omissão
      // do C4 uma rota adiante — a parcela meio recebida seguia ABERTA, no
      // horizonte e na cobrança de um contrato que não existe mais.
      const lead = await criarLead(f);
      const contrato = await criarContrato(f, {
        leadId: lead.id,
        valorTotal: 10_000,
        fechadoEm: new Date(),
      });
      const parcelaId = randomUUID();
      await db.insert(parcelasTable).values({
        id: parcelaId,
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 0,
        valorPrevisto: 10_000,
        vencimento: new Date(),
        status: "PARCIAL",
        valorRecebido: 4_000,
        recebidoEm: new Date(),
      });

      await cancelar(contrato.id, "estornar").expect(200);

      const [parcela] = await db
        .select()
        .from(parcelasTable)
        .where(eq(parcelasTable.id, parcelaId));
      expect(parcela.status).toBe("CANCELADA");
      // "Estornar" é a loja dizendo que devolveu o dinheiro: os 4.000 de uma
      // parcela meio paga são tão devolvidos quanto os 10.000 de uma quitada.
      expect(parcela.valorRecebido).toBeNull();

      const detalhe = (await trilha("CONTRATO_CANCELADO"))[0].detalhe as Record<string, unknown>;
      expect(detalhe.totalEstornado).toBe(4_000);
      // O que deixou de ser cobrável é o SALDO (6.000), não o previsto cheio.
      expect(detalhe.totalAnulado).toBe(6_000);
    });
  });

  describe("B8 — a conta de comissão não some por baixo do fechamento", () => {
    /** Um fechamento de comissão com a conta a pagar que ele gerou. */
    async function fechamentoComConta(): Promise<{ contaId: string; fechamentoId: string }> {
      const contaId = randomUUID();
      const fechamentoId = randomUUID();
      await db.insert(contasPagarTable).values({
        id: contaId,
        lojaId: f.lojaId,
        tipo: "COMISSAO",
        colaboradorId: f.vendedoraId,
        competencia: "2026-06",
        descricao: "Comissão 2026-06 — Ana",
        valorPrevisto: 1_500,
        vencimento: new Date(),
        origemComissaoFechamentoId: fechamentoId,
      });
      await db.insert(comissaoFechamentosTable).values({
        id: fechamentoId,
        lojaId: f.lojaId,
        vendedoraId: f.vendedoraId,
        competencia: "2026-06",
        totalVendas: 30_000,
        valorComissao: 1_500,
        valorTotal: 1_500,
        contaPagarId: contaId,
      });
      return { contaId, fechamentoId };
    }

    it("apagar a conta gerada por um fechamento é recusado com 409", async () => {
      const { contaId } = await fechamentoComConta();

      const res = await agent.delete(`/api/lojas/${f.lojaId}/contas-pagar/${contaId}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CONTA_DE_COMISSAO");
      // O 409 tem de ensinar o caminho, como o irmão dele ("estorne o pagamento
      // antes de remover"): quem quer desfazer a comissão reabre o fechamento.
      expect(res.body.detalhe).toMatch(/reabr/i);
    });

    it("recusado é recusado: a conta continua lá e o vínculo intacto", async () => {
      const { contaId, fechamentoId } = await fechamentoComConta();

      await agent.delete(`/api/lojas/${f.lojaId}/contas-pagar/${contaId}`).expect(409);

      const [conta] = await db
        .select()
        .from(contasPagarTable)
        .where(eq(contasPagarTable.id, contaId));
      expect(conta).toBeDefined();
      const [fechamento] = await db
        .select()
        .from(comissaoFechamentosTable)
        .where(eq(comissaoFechamentosTable.id, fechamentoId));
      // O SET NULL silencioso era o dano: com o vínculo nulo, reabrir o
      // fechamento passa por cima das duas guardas e nunca repara a conta.
      expect(fechamento.contaPagarId).toBe(contaId);
    });

    it("a despesa avulsa continua removível — a régua é a ORIGEM, não o tipo", async () => {
      const contaId = randomUUID();
      await db.insert(contasPagarTable).values({
        id: contaId,
        lojaId: f.lojaId,
        tipo: "DESPESA",
        descricao: "Aluguel de julho",
        valorPrevisto: 4_000,
        vencimento: new Date(),
      });

      await agent.delete(`/api/lojas/${f.lojaId}/contas-pagar/${contaId}`).expect(204);
    });
  });

  describe("A2 — as duas portas de pagar deixam a MESMA trilha", () => {
    async function despesa(descricao: string, valor: number): Promise<string> {
      const res = await agent
        .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
        .send({
          tipo: "DESPESA",
          descricao,
          valorPrevisto: valor,
          vencimento: new Date().toISOString(),
        })
        .expect(201);
      return res.body.id;
    }

    it("pagar por qualquer das duas rotas grava PAGAMENTO_REGISTRADO, e nunca CONTA_PAGA", async () => {
      const pelaSingle = await despesa("Internet", 200);
      const pelaMulti = await despesa("Luz", 300);

      await agent
        .post(`/api/lojas/${f.lojaId}/contas-pagar/${pelaSingle}/pagar`)
        .send({ data: new Date().toISOString(), valorPago: 200, forma: "PIX" })
        .expect(200);
      await agent
        .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
        .send({ contaIds: [pelaMulti], data: new Date().toISOString(), forma: "PIX" })
        .expect(201);

      // Antes: a single gravava CONTA_PAGA em `entidade: conta_pagar` e a multi
      // gravava PAGAMENTO_REGISTRADO em `entidade: pagamento`. Uma consulta da
      // trilha por conta a pagar encontrava metade dos pagamentos, e o histórico
      // de quem pagou o quê dependia de por qual porta se entrou.
      expect(await trilha("CONTA_PAGA")).toHaveLength(0);
      const registrados = await trilha("PAGAMENTO_REGISTRADO");
      expect(registrados).toHaveLength(2);
      expect(registrados.every((l) => l.entidade === "pagamento")).toBe(true);
    });

    /**
     * S-M2 — e as duas portas têm o MESMO piso de um centavo.
     *
     * A single tinha `minimum: 0.01` desde o E115, com um comentário no spec
     * afirmando que a multi "já tinha". Não tinha: `minimum: 0` — e o zod
     * gerado é a ÚNICA validação do servidor, o guard de um centavo vivia só
     * no navegador. Uma conta de R$ 3.200,00 ia a PAGA com saída de ZERO no
     * caixa para quem batesse na rota direto.
     */
    it("S-M2 — quitar com R$ 0,00 é recusado nas duas portas, e a conta segue PREVISTA", async () => {
      const pelaMulti = await despesa("Costureira externa", 3_200);

      // VERMELHO ANTES: 201, conta PAGA, pagamento de R$ 0,00 no caixa.
      await agent
        .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
        .send({ contaIds: [pelaMulti], data: new Date().toISOString(), valorPago: 0, forma: "PIX" })
        .expect(400);
      const [conta] = await db
        .select()
        .from(contasPagarTable)
        .where(eq(contasPagarTable.id, pelaMulti));
      expect(conta.status).toBe("PREVISTA");

      // A porta irmã já recusava — é o espelho que o comentário do spec
      // prometia e agora existe dos dois lados.
      await agent
        .post(`/api/lojas/${f.lojaId}/contas-pagar/${pelaMulti}/pagar`)
        .send({ data: new Date().toISOString(), valorPago: 0, forma: "PIX" })
        .expect(400);

      // E omitir o valor continua valendo: a saída vale a soma das contas.
      await agent
        .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
        .send({ contaIds: [pelaMulti], data: new Date().toISOString(), forma: "PIX" })
        .expect(201);
    });

    it("a saída da porta single tem a mesma forma da multi: item, rateio e valor", async () => {
      const contaId = await despesa("Aluguel", 3_500);

      await agent
        .post(`/api/lojas/${f.lojaId}/contas-pagar/${contaId}/pagar`)
        // Com desconto: o item guarda o que a conta consumiu da saída, não o
        // previsto — o invariante sum(itens) === valorPago que o fluxo e o DRE
        // dependem. Uma conta sozinha é o rateio de tamanho 1.
        .send({ data: new Date().toISOString(), valorPago: 3_450.5, forma: "PIX" })
        .expect(200);

      const linha = (await trilha("PAGAMENTO_REGISTRADO"))[0];
      const detalhe = linha.detalhe as { valorPago: number; contas: { id: string }[] };
      expect(detalhe.valorPago).toBe(3_450.5);
      expect(detalhe.contas).toHaveLength(1);
      expect(detalhe.contas[0].id).toBe(contaId);
    });

  });
});
