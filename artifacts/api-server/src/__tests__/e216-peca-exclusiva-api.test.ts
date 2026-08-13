import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarContrato,
  criarFixture,
  criarLead,
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
 * E216 — a peça sabe que é exclusiva, e o sistema sabe se ela já saiu.
 *
 * > **CLÁUSULA 12ª** — Se tratar de rescisão de **vestido exclusivo para
 * > primeiro aluguel**, será cobrado na qualidade de multa de rescisão
 * > contratual **o valor integral do aluguel**.
 *
 * A auditoria mediu a ausência em `lib/db/src/schema/vestidos.ts`: não havia
 * atributo nenhum dizendo que a peça é exclusiva, e sem ele a 12ª não é
 * aplicável por máquina nenhuma.
 *
 * O que este arquivo prega: **a marca é da peça e sobrevive ao cadastro**, e
 * **"primeiro aluguel" NÃO é gravado** — é a contagem de saídas que já existia
 * desde o E157 (`GET /vestidos/utilizacao`), lida como estado.
 */
describe("E216 — a peça exclusiva de primeiro aluguel", () => {
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

  it("a peça nasce exclusiva quando a loja diz que é, e a marca volta na leitura", async () => {
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({
        codigo: `EX-${randomUUID().slice(0, 6)}`,
        nome: "Exclusivo da Marina",
        precoBase: 8000,
        exclusiva: true,
      })
      .expect(201);

    expect(criado.body.exclusiva).toBe(true);

    const lido = await agent
      .get(`/api/lojas/${f.lojaId}/vestidos/${criado.body.id}`)
      .expect(200);
    expect(lido.body.exclusiva).toBe(true);
  });

  it("sem dizer nada, a peça nasce NÃO exclusiva — é o caso da esmagadora maioria", async () => {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: `EX-${randomUUID().slice(0, 6)}`, nome: "Arnica", precoBase: 4200 })
      .expect(201);

    expect(r.body.exclusiva).toBe(false);
  });

  it("a marca entra e sai pela ficha — é a loja quem decide, e ela pode se corrigir", async () => {
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo: `EX-${randomUUID().slice(0, 6)}`, nome: "Yoko", precoBase: 5000 })
      .expect(201);

    const marcada = await agent
      .patch(`/api/lojas/${f.lojaId}/vestidos/${criado.body.id}`)
      .send({ exclusiva: true })
      .expect(200);
    expect(marcada.body.exclusiva).toBe(true);

    const desmarcada = await agent
      .patch(`/api/lojas/${f.lojaId}/vestidos/${criado.body.id}`)
      .send({ exclusiva: false })
      .expect(200);
    expect(desmarcada.body.exclusiva).toBe(false);
  });

  it("a lista do acervo desce a marca — é ali que a vendedora enxerga a peça", async () => {
    const vestido = await criarVestido(f, { exclusiva: true, nome: "Exclusiva na lista" });
    const r = await agent.get(`/api/lojas/${f.lojaId}/vestidos`).expect(200);
    const linha = r.body.find((v: { id: string }) => v.id === vestido.id);
    expect(linha.exclusiva).toBe(true);
  });

  /**
   * A metade que NÃO virou coluna, e é a decisão do épico.
   *
   * "Primeiro aluguel" é ESTADO, e o estado já era contável desde o E157: a
   * utilização conta os contratos ATIVOS que venderam a peça, da vida inteira
   * quando não se passa recorte. Gravar um segundo "já alugou" seria uma
   * segunda verdade sobre o mesmo número — e ela divergiria no primeiro
   * cancelamento.
   */
  it("«primeiro aluguel» não é campo: é a contagem de saídas, que já existia", async () => {
    const vestido = await criarVestido(f, { exclusiva: true, precoBase: 8000 });

    const antes = await agent.get(`/api/lojas/${f.lojaId}/vestidos/utilizacao`).expect(200);
    const linhaAntes = antes.body.find((u: { vestidoId: string }) => u.vestidoId === vestido.id);
    // Zero saídas = está no primeiro aluguel, e a 12ª incide.
    expect(linhaAntes.contratos).toBe(0);
    expect(linhaAntes.exclusiva).toBe(true);

    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 8000,
      fechadoEm: dataFutura(-100),
    });
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      tipo: "VESTIDO",
      vestidoId: vestido.id,
      descricao: "Exclusivo da Marina",
      valorUnitario: 8000,
      quantidade: 1,
    });

    const depois = await agent.get(`/api/lojas/${f.lojaId}/vestidos/utilizacao`).expect(200);
    const linhaDepois = depois.body.find((u: { vestidoId: string }) => u.vestidoId === vestido.id);
    // A marca continua — ela é história da peça, e a loja não a perde por um
    // contrato. O que mudou foi o ESTADO: já não é primeiro aluguel.
    expect(linhaDepois.exclusiva).toBe(true);
    expect(linhaDepois.contratos).toBe(1);
  });
});
