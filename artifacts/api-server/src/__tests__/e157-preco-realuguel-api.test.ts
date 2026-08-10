import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { db, contratoItensTable } from "@workspace/db";
import { randomUUID } from "node:crypto";

/**
 * E157 — a peça sabe quantas vezes saiu, e o preço acompanha.
 *
 * O ateliê precifica pela VEZ em que a peça sai: o caderno registra a contagem
 * 7 vezes em 14 semanas — `1º Aluguel` (YOKO, Adelita, Andreia), `2º Aluguel`
 * (Nixia), `2º` (BLARY), `Realuguel` (Fencyella, Adelita). O sistema tinha um
 * preço só, e a pergunta que segurava o A4 era se o `7.600` do papel era valor
 * ou código. A dona respondeu (P5): **é valor**.
 *
 * O que este arquivo prega: o preço de segunda saída existe e sobrevive ao
 * cadastro, nulo continua sendo o caso comum, e **a contagem que decide qual
 * preço vale já era da vida inteira** — não há motor novo.
 */
describe("E157 — preço de realuguel e contagem de saídas", () => {
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

  it("a peça guarda o preço de segunda saída ao lado do de tabela", async () => {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: `RL-${randomUUID().slice(0, 6)}`, nome: "Adelita", precoBase: 5000, precoRealuguel: 3500 })
      .expect(201);

    expect(r.body.precoBase).toBe(5000);
    expect(r.body.precoRealuguel).toBe(3500);
  });

  it("sem preço de realuguel, a peça nasce nula — é o caso comum e o de sempre", async () => {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: `RL-${randomUUID().slice(0, 6)}`, nome: "Arnica", precoBase: 4200 })
      .expect(201);
    expect(r.body.precoRealuguel).toBeNull();
  });

  it("o preço entra e sai depois — null explícito apaga", async () => {
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: `RL-${randomUUID().slice(0, 6)}`, nome: "Yoko", precoBase: 5000 })
      .expect(201);

    const comPreco = await agent
      .patch(`/api/lojas/${f.lojaId}/vestidos/${criado.body.id}`)
      .send({ precoRealuguel: 3200 })
      .expect(200);
    expect(comPreco.body.precoRealuguel).toBe(3200);

    const semPreco = await agent
      .patch(`/api/lojas/${f.lojaId}/vestidos/${criado.body.id}`)
      .send({ precoRealuguel: null })
      .expect(200);
    expect(semPreco.body.precoRealuguel).toBeNull();
  });

  /**
   * A contagem que a régua de preço lê. **Ela já existia** — o que faltava era
   * alguém lê-la na hora de montar o item. O recorte `de`/`ate` é opcional, e
   * sem ele a conta é da VIDA INTEIRA da peça, que é o que "2º Aluguel"
   * significa no caderno.
   */
  it("a utilização conta as saídas da vida inteira, e desce o preço de realuguel junto", async () => {
    const vestido = await criarVestido(f, { precoBase: 5000, precoRealuguel: 3500 });

    // Duas locações passadas, cada uma com seu contrato ATIVO.
    for (const offset of [-400, -200]) {
      const lead = await criarLead(f);
      const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
      await criarOrcamentoItem(f, {
        orcamentoId: orcamento.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        valorUnitario: 5000,
      });
      const contrato = await criarContrato(f, {
        leadId: lead.id,
        valorTotal: 5000,
        fechadoEm: dataFutura(offset),
      });
      await db.insert(contratoItensTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        descricao: "Adelita",
        valorUnitario: 5000,
        quantidade: 1,
      });
    }

    const r = await agent.get(`/api/lojas/${f.lojaId}/vestidos/utilizacao`).expect(200);
    const linha = r.body.find((u: { vestidoId: string }) => u.vestidoId === vestido.id);

    expect(linha.contratos).toBe(2);
    // O preço desce na mesma linha: quem lê a utilização decide quanto cobrar
    // da próxima saída sem uma segunda consulta.
    expect(linha.precoRealuguel).toBe(3500);
  });

  it("o recorte por período continua valendo — e é o que separa giro de vida inteira", async () => {
    const vestido = await criarVestido(f, { precoBase: 5000 });
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-500),
    });
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      tipo: "VESTIDO",
      vestidoId: vestido.id,
      descricao: "Peça antiga",
      valorUnitario: 5000,
      quantidade: 1,
    });

    const vidaInteira = await agent.get(`/api/lojas/${f.lojaId}/vestidos/utilizacao`).expect(200);
    expect(
      vidaInteira.body.find((u: { vestidoId: string }) => u.vestidoId === vestido.id).contratos,
    ).toBe(1);

    // A mesma rota, recortada depois daquele contrato: zero.
    const recente = await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/utilizacao`)
      .query({ de: "2030-01-01" })
      .expect(200);
    expect(
      recente.body.find((u: { vestidoId: string }) => u.vestidoId === vestido.id).contratos,
    ).toBe(0);
  });

  it("preço negativo não passa", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: `RL-${randomUUID().slice(0, 6)}`, nome: "X", precoBase: 100, precoRealuguel: -1 })
      .expect(400);
  });
});
