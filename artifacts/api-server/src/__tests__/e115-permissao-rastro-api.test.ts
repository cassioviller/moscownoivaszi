import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { auditLogTable, contasPagarTable, db, parcelasTable, perfisTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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
 * E115 — a permissão diz o que a rota faz, e o carimbo deixa rastro.
 *
 * `POST /conciliacao/marcar` e `POST /contabilidade/enviar` mutam linhas
 * existentes (carimbos de mão única, sem rota que desfaça) e derivavam `criar`
 * no gate — `POST_QUE_MUTA` não tinha os verbos, e a varredura B5 só olhava
 * POSTs na forma `/:id/<verbo>`. `POST /financeiro/pagamentos` — a MESMA
 * operação da porta irmã que declara `editar` desde o E101, e a única que a
 * tela de Pagar usa — derivava `criar` pelo substantivo.
 *
 * E o `marcar` era a única escrita de carimbo sem autor: o irmão
 * `contabilidade/enviar`, criado no MESMO épico E103, audita desde o F34.
 */
describe("E115 — a permissão diz o que a rota faz, e o carimbo deixa rastro", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function comPerfilFinanceiro(acoes: { ver: boolean; criar: boolean; editar: boolean }) {
    const fx = await criarFixture();
    await db
      .update(perfisTable)
      .set({ acessosModulos: { financeiro: acoes } })
      .where(eq(perfisTable.id, fx.perfilId));
    return { fx, agent: await loginComLoja(fx.vendedoraEmail, fx.lojaId) };
  }

  async function parcelaRecebida(fx: Fixture) {
    const lead = await criarLead(fx);
    const contrato = await criarContrato(fx, {
      leadId: lead.id,
      valorTotal: 1000,
      fechadoEm: new Date(),
    });
    const [p] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: fx.lojaId,
        contratoId: contrato.id,
        numero: 1,
        valorPrevisto: 1000,
        vencimento: dataFutura(10),
        status: "PAGA",
        valorRecebido: 1000,
        recebidoEm: new Date(),
      })
      .returning();
    return p;
  }

  it("a estagiária com `criar` e sem `editar` NÃO fecha o mês nem carimba conciliação", async () => {
    const { fx, agent } = await comPerfilFinanceiro({ ver: true, criar: true, editar: false });
    try {
      // VERMELHO ANTES: 200 — ela carimbava o mês inteiro à contadora, a
      // escrita que o próprio código chama de "a segunda mais irreversível do
      // financeiro", sem rota que limpe o carimbo.
      const enviar = await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/contabilidade/enviar`)
        .send({ de: "2026-06-01", ate: "2026-06-30" })
        .expect(403);
      expect(enviar.body.acao).toBe("editar");

      // VERMELHO ANTES: 200 — dava movimentos por conferidos com o extrato.
      const marcar = await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/conciliacao/marcar`)
        .send({ parcelaIds: [randomUUID()] })
        .expect(403);
      expect(marcar.body.acao).toBe("editar");

      // VERMELHO ANTES: 201 — pagava as contas do mês pela porta multi-conta,
      // enquanto a porta irmã de UMA conta já a recusava com `editar`.
      const pagar = await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/pagamentos`)
        .send({ data: new Date().toISOString(), contaIds: [randomUUID()] })
        .expect(403);
      expect(pagar.body.acao).toBe("editar");
    } finally {
      await limparFixture(fx);
    }
  });

  it("a gerente com `editar` e sem `criar` fecha o mês, marca e paga", async () => {
    const { fx, agent } = await comPerfilFinanceiro({ ver: true, criar: false, editar: true });
    try {
      // VERMELHO ANTES: 403 {acao: "criar"} — culpando uma ação que ela não
      // estava tentando fazer, na ação que é dela.
      await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/contabilidade/enviar`)
        .send({ de: "2026-06-01", ate: "2026-06-30" })
        .expect(200);

      const p = await parcelaRecebida(fx);
      const marcar = await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/conciliacao/marcar`)
        .send({ parcelaIds: [p.id] })
        .expect(200);
      expect(marcar.body.parcelas).toBe(1);

      const [conta] = await db
        .insert(contasPagarTable)
        .values({
          id: randomUUID(),
          lojaId: fx.lojaId,
          tipo: "DESPESA",
          descricao: "Aluguel",
          valorPrevisto: 200,
          vencimento: dataFutura(5),
          status: "PREVISTA",
        })
        .returning();
      await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/pagamentos`)
        .send({ data: new Date().toISOString(), contaIds: [conta.id] })
        .expect(201);
    } finally {
      await limparFixture(fx);
    }
  });

  it("marcar conciliação deixa rastro com autor — e clique vazio não grava", async () => {
    const { fx, agent } = await comPerfilFinanceiro({ ver: true, criar: false, editar: true });
    try {
      const p = await parcelaRecebida(fx);
      await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/conciliacao/marcar`)
        .send({ parcelaIds: [p.id] })
        .expect(200);

      // VERMELHO ANTES: zero linhas — "quem deu este movimento por conferido,
      // e quando?" ficava sem resposta, num carimbo sem rota que desfaça.
      const trilha = await db
        .select()
        .from(auditLogTable)
        .where(and(eq(auditLogTable.lojaId, fx.lojaId), eq(auditLogTable.acao, "CONCILIACAO_MARCADA")));
      expect(trilha.length).toBe(1);
      const detalhe = trilha[0].detalhe as { parcelas: number; parcelaIds: string[] };
      expect(detalhe.parcelas).toBe(1);
      expect(detalhe.parcelaIds).toEqual([p.id]);

      // Remarcar o mesmo lote não carimba nada — e um clique que não carimbou
      // nada não é um fato: a trilha continua com UMA linha.
      await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/conciliacao/marcar`)
        .send({ parcelaIds: [p.id] })
        .expect(200);
      const trilhaDepois = await db
        .select()
        .from(auditLogTable)
        .where(and(eq(auditLogTable.lojaId, fx.lojaId), eq(auditLogTable.acao, "CONCILIACAO_MARCADA")));
      expect(trilhaDepois.length).toBe(1);
    } finally {
      await limparFixture(fx);
    }
  });

  it("uma parcela PREVISTA não pode 'bater com o extrato'", async () => {
    const { fx, agent } = await comPerfilFinanceiro({ ver: true, criar: false, editar: true });
    try {
      const lead = await criarLead(fx);
      const contrato = await criarContrato(fx, {
        leadId: lead.id,
        valorTotal: 1000,
        fechadoEm: new Date(),
      });
      const [prevista] = await db
        .insert(parcelasTable)
        .values({
          id: randomUUID(),
          lojaId: fx.lojaId,
          contratoId: contrato.id,
          numero: 1,
          valorPrevisto: 1000,
          vencimento: dataFutura(10),
          status: "PREVISTA",
        })
        .returning();

      // VERMELHO ANTES: parcelas: 1 — um movimento que o banco nunca viu era
      // dado por conferido, com carimbo de mão única.
      const r = await agent
        .post(`/api/lojas/${fx.lojaId}/financeiro/conciliacao/marcar`)
        .send({ parcelaIds: [prevista.id] })
        .expect(200);
      expect(r.body.parcelas).toBe(0);

      const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, prevista.id));
      expect(linha.conciliadoEm).toBeNull();
    } finally {
      await limparFixture(fx);
    }
  });
});
