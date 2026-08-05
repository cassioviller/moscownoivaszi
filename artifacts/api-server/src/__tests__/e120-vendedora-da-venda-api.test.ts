import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, auditLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E120/S-D4 — a vendedora da VENDA não é autoria: ela pode legitimamente ser
 * outra pessoa que não quem clicou (a Ana monta o orçamento, a dona fecha o
 * contrato de manhã). Por isso o servidor ACEITA a divergência — travar
 * quebraria o caso real (P1, default do dono: rastrear, não recusar) — mas
 * ela passa a deixar rastro: numa escada de 5%, um contrato de R$ 4.200,00
 * são R$ 210,00 de comissão trocando de bolso, e a trilha é o único lugar
 * onde "quem vendeu de verdade?" tem resposta depois.
 *
 * Quem clicou continua vindo da sessão (req.usuario) — a régua de autoria do
 * replit.md não muda aqui.
 */
describe("E120 — contrato com vendedora divergente do orçamento deixa rastro", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    // Quem clica é o superadmin (a "dona"); o orçamento é da vendedora.
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function orcamentoAprovado() {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, {
      leadId: lead.id,
      status: "RASCUNHO",
      vendedoraId: f.vendedoraId,
    });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 4200, quantidade: 1 });
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ status: "ENVIADO" })
      .expect(200);
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/aprovar`).expect(204);
    return { lead, orcamento };
  }

  async function trilhaDe(contratoId: string) {
    return db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.lojaId, f.lojaId),
          eq(auditLogTable.acao, "CONTRATO_VENDEDORA_DIVERGENTE"),
          eq(auditLogTable.entidadeId, contratoId),
        ),
      );
  }

  it("vendedora do corpo ≠ vendedora do orçamento → 201 e uma linha na trilha, com os dois lados", async () => {
    const { lead, orcamento } = await orcamentoAprovado();

    // A dona fecha a venda em nome DELA — o caso do B1, aceito de propósito.
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.superAdminId,
        valorTotal: 4200,
      })
      .expect(201);

    const linhas = await trilhaDe(r.body.id);
    expect(linhas).toHaveLength(1);
    const detalhe = linhas[0].detalhe as Record<string, unknown>;
    expect(detalhe.orcamentoId).toBe(orcamento.id);
    // S-D29 renomeou a chave: a referência deixou de ser sempre o orçamento.
    expect(detalhe.vendedoraDaReferenciaId).toBe(f.vendedoraId);
    expect(detalhe.referenciaOrigem).toBe("ORCAMENTO");
    expect(detalhe.vendedoraDoContratoId).toBe(f.superAdminId);
    expect(detalhe.valorTotal).toBe(4200);
    // Autor da sessão: quem CLICOU, que não é o mesmo papel da vendedora da venda.
    expect(linhas[0].usuarioId).toBe(f.superAdminId);
  });

  it("vendedora do corpo = vendedora do orçamento → 201 e trilha limpa", async () => {
    const { lead, orcamento } = await orcamentoAprovado();

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 4200,
      })
      .expect(201);

    expect(await trilhaDe(r.body.id)).toHaveLength(0);
  });

  /**
   * S-D29 — este bloco existia ao contrário. O teste abaixo se chamava
   * "contrato sem orçamento não grava — NÃO HÁ COM O QUE DIVERGIR", e fixava o
   * silêncio como se fosse a regra: sem orçamento, o E120 não tinha referência
   * e não gravava nada. Só que `orcamentoId` não é obrigatório no
   * `ContratoInput`, então esse era o caminho LARGO — um `POST /contratos` sem
   * orçamento punha a venda, e a comissão que ela soma, no nome de qualquer
   * colega da loja, sem uma linha de trilha e sem tela nenhuma.
   *
   * A referência sem orçamento é quem está REGISTRANDO. A pergunta é a mesma
   * que o E120 fez: a venda está sendo posta no nome de outra pessoa?
   */
  it("sem orçamento e em nome de OUTRA pessoa → 201 e uma linha, com a referência da sessão", async () => {
    const lead = await criarLead(f);
    // A dona registra, e a venda sai no nome da vendedora. Numa escada de 5%,
    // R$ 4.200,00 são R$ 210,00 de comissão trocando de bolso — a mesma conta
    // do E120, pelo caminho que ele não cobria.
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 4200 })
      .expect(201);

    const linhas = await trilhaDe(r.body.id);
    expect(linhas).toHaveLength(1);
    const detalhe = linhas[0].detalhe as Record<string, unknown>;
    expect(detalhe.referenciaOrigem).toBe("SESSAO");
    expect(detalhe.orcamentoId).toBeNull();
    expect(detalhe.vendedoraDaReferenciaId).toBe(f.superAdminId);
    expect(detalhe.vendedoraDoContratoId).toBe(f.vendedoraId);
    expect(detalhe.valorTotal).toBe(4200);
    expect(String(detalhe.descricao)).toMatch(/^Registrado por /);
  });

  it("sem orçamento e em nome de quem registra → 201 e trilha limpa", async () => {
    const lead = await criarLead(f);
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.superAdminId, valorTotal: 1000 })
      .expect(201);

    expect(await trilhaDe(r.body.id)).toHaveLength(0);
  });
});
