import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, orcamentoVersoesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { addDias, diaDeNegocio, hojeLocal } from "@workspace/financeiro-core";

/**
 * E95 — a tela de orçamento para de calcular dinheiro.
 *
 * O que estes casos guardam é uma frase só: **o número que o sistema mostra
 * para o orçamento é o mesmo que o `POST /contratos` aceita**. Antes eram dois
 * números — a rota de orçamento em reais float, o validador do contrato em
 * centavos —, e quando o líquido caía em meio centavo a vendedora recebia um
 * 422 `VALOR_TOTAL_NAO_BATE` sem saída pela tela: o valor que ela via era
 * justamente o único recusado.
 */
describe("E95 — a tela de orçamento para de calcular dinheiro", () => {
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

  /** O contrato só nasce de orçamento APROVADO — é o caminho inteiro da venda. */
  async function enviarEAprovar(orcamentoId: string) {
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoId}`)
      .send({ status: "ENVIADO" })
      .expect(200);
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoId}/aprovar`).expect(204);
  }

  async function versaoDe(orcamentoId: string) {
    const [v] = await db
      .select()
      .from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamentoId));
    return v;
  }

  describe("o líquido do orçamento é aceito pelo contrato (C1)", () => {
    /** Os dois pares que a trilha C mediu como quebrados. */
    const CASOS = [
      { bruto: 1000.5, desconto: 5, liquido: 950.48, float: 950.47 },
      { bruto: 1051, desconto: 2.5, liquido: 1024.73, float: 1024.72 },
    ];

    for (const caso of CASOS) {
      it(`R$ ${caso.bruto} com ${caso.desconto}% fecha em ${caso.liquido} — e o contrato aceita`, async () => {
        const lead = await criarLead(f);
        const orcamento = await criarOrcamento(f, {
          leadId: lead.id,
          status: "RASCUNHO",
          descontoTipo: "PERCENTUAL",
          descontoValor: caso.desconto,
        });
        await criarOrcamentoItem(f, {
          orcamentoId: orcamento.id,
          valorUnitario: caso.bruto,
          quantidade: 1,
        });
        await enviarEAprovar(orcamento.id);

        // O número que o sistema congela — o mesmo que o portal da noiva mostra.
        const congelada = await versaoDe(orcamento.id);
        expect(congelada.totalLiquido).toBe(caso.liquido);
        expect(congelada.totalLiquido).not.toBe(caso.float);

        // E o contrato aceita exatamente esse número. Era aqui que dava 422.
        await agent
          .post(`/api/lojas/${f.lojaId}/contratos`)
          .send({
            leadId: lead.id,
            orcamentoId: orcamento.id,
            vendedoraId: f.vendedoraId,
            valorTotal: congelada.totalLiquido,
            fechadoEm: dataFutura(-1).toISOString(),
          })
          .expect(201);
      });
    }

    it("o valor float ANTIGO é o recusado — a régua não aceita os dois", async () => {
      const lead = await criarLead(f);
      const orcamento = await criarOrcamento(f, {
        leadId: lead.id,
        status: "RASCUNHO",
        descontoTipo: "PERCENTUAL",
        descontoValor: 5,
      });
      await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 1000.5, quantidade: 1 });
      await enviarEAprovar(orcamento.id);

      const r = await agent
        .post(`/api/lojas/${f.lojaId}/contratos`)
        .send({
          leadId: lead.id,
          orcamentoId: orcamento.id,
          vendedoraId: f.vendedoraId,
          valorTotal: 950.47,
          fechadoEm: dataFutura(-1).toISOString(),
        })
        .expect(422);
      expect(r.body.error).toBe("VALOR_TOTAL_NAO_BATE");
    });
  });

  describe("o carnê do gerar-plano é mensal por dia fixo (C9)", () => {
    async function contratoDe(valorTotal: number) {
      const lead = await criarLead(f);
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/contratos`)
        .send({
          leadId: lead.id,
          vendedoraId: f.vendedoraId,
          valorTotal,
          fechadoEm: dataFutura(-1).toISOString(),
        })
        .expect(201);
      return r.body.id as string;
    }

    const dias = (body: { vencimento: string }[]) =>
      body.map((p) => diaDeNegocio(new Date(p.vencimento)));

    it("o dia 31 se repete e grampeia só no mês curto", async () => {
      const contratoId = await contratoDe(400);
      const plano = await agent
        .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
        .send({ numParcelas: 4, primeiroVencimento: "2026-01-31T12:00:00-03:00" })
        .expect(201);

      expect(dias(plano.body)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    });

    it("com entrada, a parcela 1 cai no dia pedido — e não trinta dias depois dele", async () => {
      const contratoId = await contratoDe(1000);
      const plano = await agent
        .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
        .send({
          entrada: 100,
          numParcelas: 3,
          primeiroVencimento: "2026-08-10T12:00:00-03:00",
          vencimentoEntrada: "2026-07-27T12:00:00-03:00",
        })
        .expect(201);

      expect(dias(plano.body)).toEqual(["2026-07-27", "2026-08-10", "2026-09-10", "2026-10-10"]);
      expect(plano.body[0].numero).toBe(0);
    });

    it("sem vencimentoEntrada, a entrada é HOJE — não o instante de agora", async () => {
      const contratoId = await contratoDe(1000);
      const plano = await agent
        .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
        .send({ entrada: 100, numParcelas: 2, primeiroVencimento: "2026-08-10T12:00:00-03:00" })
        .expect(201);
      expect(diaDeNegocio(new Date(plano.body[0].vencimento))).toBe(hojeLocal());
    });
  });

  describe("validade por construção e versão sempre congelada (F18, B11)", () => {
    it("orçamento criado SEM validade nasce com trinta dias — é o que o liga ao lembrete", async () => {
      const lead = await criarLead(f);
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/orcamentos`)
        .send({ leadId: lead.id })
        .expect(201);

      expect(r.body.validade).toBeTruthy();
      expect(diaDeNegocio(new Date(r.body.validade))).toBe(addDias(hojeLocal(), 30));
    });

    it("validade explícita continua mandando — o default não atropela quem decidiu", async () => {
      const lead = await criarLead(f);
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/orcamentos`)
        .send({ leadId: lead.id, validade: "2026-12-24T12:00:00-03:00" })
        .expect(201);
      expect(diaDeNegocio(new Date(r.body.validade))).toBe("2026-12-24");
    });

    it("ENVIADO nunca fica sem versão congelada, pelos DOIS caminhos que enviam", async () => {
      // Caminho 1: PATCH de status.
      const leadA = await criarLead(f);
      const a = await criarOrcamento(f, { leadId: leadA.id, status: "RASCUNHO" });
      await criarOrcamentoItem(f, { orcamentoId: a.id, valorUnitario: 100, quantidade: 1 });
      await agent
        .patch(`/api/lojas/${f.lojaId}/orcamentos/${a.id}`)
        .send({ status: "ENVIADO" })
        .expect(200);

      // Caminho 2: gerar link de um RASCUNHO — compartilhar É enviar.
      const leadB = await criarLead(f);
      const b = await criarOrcamento(f, { leadId: leadB.id, status: "RASCUNHO" });
      await criarOrcamentoItem(f, { orcamentoId: b.id, valorUnitario: 100, quantidade: 1 });
      await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${b.id}/link`).expect(200);

      for (const id of [a.id, b.id]) {
        const versoes = await db
          .select()
          .from(orcamentoVersoesTable)
          .where(eq(orcamentoVersoesTable.orcamentoId, id));
        expect(versoes).toHaveLength(1);
        expect(versoes[0].numero).toBe(1);
        expect(versoes[0].hash).toBeTruthy();
      }
    });
  });
});
