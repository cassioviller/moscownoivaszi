import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("Lote 13 — edição de item de orçamento (API)", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("PATCH /orcamentos/itens/:itemId edita descrição, valor e quantidade", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const item = await criarOrcamentoItem(f, { orcamentoId: orc.id, valorUnitario: 5000, quantidade: 1 });

    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ descricao: "Vestido com cauda", valorUnitario: 7500, quantidade: 2 })
      .expect(200);
    expect(res.body.descricao).toBe("Vestido com cauda");
    expect(res.body.valorUnitario).toBe(7500);
    expect(res.body.quantidade).toBe(2);

    // Edição parcial não apaga os demais campos.
    const parcial = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ quantidade: 3 })
      .expect(200);
    expect(parcial.body.descricao).toBe("Vestido com cauda");
    expect(parcial.body.valorUnitario).toBe(7500);
    expect(parcial.body.quantidade).toBe(3);
  });

  it("PATCH valida payload (quantidade < 1 → 400) e escopo de loja (item de outra loja → 404)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    const item = await criarOrcamentoItem(f, { orcamentoId: orc.id });

    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ quantidade: 0 })
      .expect(400);

    const outra = await criarFixture();
    try {
      const agentOutra = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
      await agentOutra
        .patch(`/api/lojas/${outra.lojaId}/orcamentos/itens/${item.id}`)
        .send({ quantidade: 2 })
        .expect(404);
    } finally {
      await limparFixture(outra);
    }
  });
});
