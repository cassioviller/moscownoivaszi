import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, orcamentoVersoesTable, orcamentosTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  criarFixture,
  criarBloqueio,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * B1 do plano do resto das sobras — o dinheiro do orçamento, pelos dois lados
 * que ninguém olhava.
 */
// Uma fixture e um POOL por arquivo: dois `fecharPool` matariam o segundo
// describe no `beforeAll` — `Cannot use a pool after calling end on the pool`.
// Medido em 2026-08-12, ao separar os dois achados em blocos.
let f: Fixture;

beforeAll(async () => {
  f = await criarFixture();
});

afterAll(async () => {
  await limparFixture(f);
  await fecharPool();
});

describe("S-O25 — o teto do desconto se rompe pelo lado dos ITENS", () => {

  /**
   * O A07.3 (E169) fechou a porta do DESCONTO: `recusaDeDesconto` recusa
   * R$ 4.000,00 sobre R$ 3.000,00 de itens, porque o líquido sairia clampado em
   * R$ 0,00. Mas o teto é uma RELAÇÃO entre dois números, e a guarda só rodava
   * quando um deles mudava.
   *
   * **Vermelho medido em 2026-08-12:**
   *
   * ```
   * desconto R$ 4.000,00 sobre R$ 5.000,00 : 200   ← passa, e deve
   * DELETE do item de R$ 2.000,00          : 204   ← bruto vira R$ 3.000,00
   * desconto gravado                       : R$ 4000 VALOR
   * PATCH item 5→1 (bruto 5000→1000)       : 200
   * ```
   */
  async function orcamentoDe(valores: number[], desconto: number) {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    const itens = [];
    for (const [i, v] of valores.entries()) {
      const it = await agent
        .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
        .send({ tipo: "SERVICO", descricao: `Item ${i + 1}`, valorUnitario: v, quantidade: 1 })
        .expect(201);
      itens.push(it.body);
    }
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: desconto })
      .expect(200);
    return { agent, lead, orcamentoId: orc.body.id as string, itens };
  }

  it("tirar o item que sustentava o desconto é recusado, com os dois números na frase", async () => {
    const { agent, itens } = await orcamentoDe([3000, 2000], 4000);

    const r = await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${itens[1]!.id}`);
    expect(r.status, "era 204 — o desconto sobrevivia ao item que o sustentava").toBe(422);
    expect(r.body.error).toBe("DESCONTO_INVALIDO");
    expect(r.body.detalhe, "a frase diz os DOIS números").toMatch(/4\.000,00/);
    expect(r.body.detalhe).toMatch(/3\.000,00/);
  });

  it("e a recusa não deixa rastro: o item continua lá", async () => {
    const { agent, orcamentoId, itens } = await orcamentoDe([3000, 2000], 4000);
    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${itens[1]!.id}`).expect(422);

    const lista = await agent.get(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoId}`).expect(200);
    expect(lista.body.itens, "a transação desfez tudo").toHaveLength(2);
  });

  it("baixar a quantidade pelo PATCH cai na mesma régua", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    const item = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Cinco véus", valorUnitario: 1000, quantidade: 5 })
      .expect(201);
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}`)
      .send({ descontoTipo: "VALOR", descontoValor: 4000 })
      .expect(200);

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.body.id}`)
      .send({ quantidade: 1 });
    expect(r.status, "era 200 — bruto caía de R$ 5.000,00 para R$ 1.000,00").toBe(422);
    expect(r.body.error).toBe("DESCONTO_INVALIDO");
  });

  it("tirar item de orçamento SEM desconto em valor continua livre", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    const a = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Um", valorUnitario: 3000, quantidade: 1 })
      .expect(201);
    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${a.body.id}`).expect(204);
  });

  it("desconto PERCENTUAL não se mede contra o bruto — tirar item segue livre", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    const a = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Um", valorUnitario: 3000, quantidade: 1 })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "SERVICO", descricao: "Dois", valorUnitario: 2000, quantidade: 1 })
      .expect(201);
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}`)
      .send({ descontoTipo: "PERCENTUAL", descontoValor: 80 })
      .expect(200);
    // 80% de qualquer bruto é sempre menor que o bruto — o teto do PERCENTUAL
    // é 100, e ele não depende dos itens.
    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${a.body.id}`).expect(204);
  });
});

/**
 * S-O29 (A07.4) — **o hash prende o que a proposta DIZ, não o que ela É.**
 *
 * `conteudoEnviado` congela `{tipo, descricao, valorUnitario, quantidade}` e
 * nada mais: trocar o `vestidoId` de um item mantendo descrição e preço não
 * move o hash, e o `POST /contratos` aceitava. A noiva prova o vestido A,
 * aceita "Vestido tomara-que-caia marfim · R$ 5.000,00", e o contrato fechava
 * sobre o vestido B — mesmo papel, outra peça.
 *
 * A identidade passou a viajar ao lado do hash (`itens_vestido_ids`), na mesma
 * ordem canônica, para não invalidar nenhum hash já gravado.
 */
describe("S-O29 — a peça que o aceite não prendia", () => {
  // A fixture e o pool são os do topo do arquivo: dois `fecharPool` no mesmo
  // arquivo matam o segundo describe no `beforeAll` — `Cannot use a pool after
  // calling end on the pool`. Medido em 2026-08-12, ao separar os dois achados.

  /**
   * A troca acontece por APAGAR e RECRIAR o item, e não por PATCH: o
   * `OrcamentoItemUpdate` não aceita `vestidoId` (mandá-lo dava 500 até este
   * épico — S-O48). É o caminho real, e ele mantém o hash intacto do mesmo
   * jeito, porque descrição e valor são os mesmos.
   */
  async function propostaEnviada(descricao = "Vestido tomara-que-caia marfim") {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestidoA = await criarVestido(f);
    const vestidoB = await criarVestido(f);
    const casamento = dataFutura(180);

    // Item VESTIDO exige reserva no fechamento (E150/E162) — as duas peças
    // nascem reservadas para a noiva, senão o 422 que se mede é o outro.
    const bloqueioA = await criarBloqueio(f, {
      vestidoId: vestidoA.id,
      leadId: lead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento,
    });
    const bloqueioB = await criarBloqueio(f, {
      vestidoId: vestidoB.id,
      leadId: lead.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento,
    });

    const orc = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos`)
      .send({ leadId: lead.id })
      .expect(201);
    const item = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/itens`)
      .send({ tipo: "VESTIDO", vestidoId: vestidoA.id, descricao, valorUnitario: 5000, quantidade: 1 })
      .expect(201);
    // Gerar o link É enviar — congela a versão.
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orc.body.id}/link`).send({}).expect(200);

    return {
      agent,
      lead,
      vestidoA,
      vestidoB,
      bloqueioA,
      bloqueioB,
      casamento,
      descricao,
      orcamentoId: orc.body.id as string,
      item: item.body,
    };
  }

  /**
   * O contrato exige orçamento APROVADO. A ordem importa e é a real: o link
   * CONGELA a versão, a troca acontece com a proposta ENVIADA (o E75 deixa
   * editar de propósito — a noiva vê a versão congelada, não o vivo), e só
   * então a aprovação carimba o hash da versão vigente (C7/O5).
   */
  const aprovar = (agent: Awaited<ReturnType<typeof loginComLoja>>, orcamentoId: string) =>
    agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoId}/aprovar`).send({}).expect(204);

  const versaoVigente = async (orcamentoId: string) => {
    const [v] = await db
      .select()
      .from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamentoId))
      .orderBy(desc(orcamentoVersoesTable.numero))
      .limit(1);
    return v;
  };

  it("a versão congelada guarda a identidade das peças, fora do hash", async () => {
    const { orcamentoId, vestidoA } = await propostaEnviada();
    const v = await versaoVigente(orcamentoId);
    expect(v?.itensVestidoIds).toEqual([vestidoA.id]);
  });

  it("trocar a peça NÃO move o hash — e agora é barrado mesmo assim", async () => {
    const { agent, lead, vestidoB, bloqueioB, casamento, descricao, orcamentoId, item } =
      await propostaEnviada();
    const antes = await versaoVigente(orcamentoId);

    // A troca: mesma descrição, mesmo valor, OUTRA peça.
    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`).expect(204);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoId}/itens`)
      .send({ tipo: "VESTIDO", vestidoId: vestidoB.id, descricao, valorUnitario: 5000, quantidade: 1 })
      .expect(201);
    await aprovar(agent, orcamentoId);

    const contrato = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      orcamentoId,
      valorTotal: 5000,
      dataCasamento: casamento.toISOString(),
      bloqueioVestidoIds: [bloqueioB.id],
    });

    expect(contrato.status, "era 201: o hash é o mesmo, porque ele não prende o vestidoId").toBe(422);
    expect(contrato.body.error).toBe("PECA_DIVERGE_DO_ACEITE");
    expect(contrato.body.detalhe, "a frase diz o que aconteceu, não o mecanismo").toMatch(
      /não é o mesmo vestido/i,
    );

    // A prova de que o hash NÃO se moveu — é isso que fazia a guarda antiga
    // aprovar a troca.
    const depois = await versaoVigente(orcamentoId);
    expect(depois?.hash, "a versão congelada não mudou").toBe(antes?.hash);
  });

  it("sem troca, o contrato fecha como sempre", async () => {
    const { agent, lead, bloqueioA, casamento, orcamentoId } = await propostaEnviada();
    await aprovar(agent, orcamentoId);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId,
        valorTotal: 5000,
        dataCasamento: casamento.toISOString(),
        bloqueioVestidoIds: [bloqueioA.id],
      })
      .expect(201);
  });

  /**
   * A decisão de compatibilidade, pregada: versão anterior à coluna tem
   * `itens_vestido_ids` NULO, e a guarda se desliga nela. Não se cobra de um
   * snapshot o que ele nunca guardou — a mesma decisão que o O7/C5 tomou para
   * `observacoes` e `validade`.
   */
  it("versão antiga (identidade nula) não é cobrada — o snapshot nunca a guardou", async () => {
    const { agent, lead, vestidoB, bloqueioB, casamento, descricao, orcamentoId, item } =
      await propostaEnviada();
    await db
      .update(orcamentoVersoesTable)
      .set({ itensVestidoIds: null })
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamentoId));

    await agent.delete(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`).expect(204);
    await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamentoId}/itens`)
      .send({ tipo: "VESTIDO", vestidoId: vestidoB.id, descricao, valorUnitario: 5000, quantidade: 1 })
      .expect(201);
    await aprovar(agent, orcamentoId);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId,
        valorTotal: 5000,
        dataCasamento: casamento.toISOString(),
        bloqueioVestidoIds: [bloqueioB.id],
      })
      .expect(201);

    const [o] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamentoId));
    expect(o?.status).toBe("APROVADO");
  });

  /** S-O48 — o corpo sem campo conhecido dava 500; agora diz o que aceita. */
  it("PATCH de item com corpo sem campo conhecido responde 400, não 500", async () => {
    const { agent, item, vestidoB } = await propostaEnviada("Outro vestido");
    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ vestidoId: vestidoB.id });
    expect(r.status, "era 500 — `.set({})` estoura no drizzle").toBe(400);
    expect(r.body.error).toBe("CORPO_VAZIO");
  });
});
