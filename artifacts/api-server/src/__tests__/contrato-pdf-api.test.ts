import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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

describe("PDF do contrato", () => {
  let f: Fixture;
  let outra: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
    outra = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await limparFixture(outra);
    await fecharPool();
  });

  it("devolve um PDF com os dados do contrato (200)", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f, { noivaNome: "Ana Lima", whatsapp: "11999990000" });
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, descricao: "Vestido Sereia", valorUnitario: 3000 });

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId: orcamento.id,
        valorTotal: 3000,
        cpf: "123.456.789-00",
        formaPagamento: "PIX",
        parcelas: [
          { numero: 0, valorPrevisto: 1000, vencimento: dataFutura(-60).toISOString() },
          { numero: 1, valorPrevisto: 2000, vencimento: dataFutura(-30).toISOString() },
        ],
      })
      .expect(201);

    const res = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/pdf`)
      .buffer()
      .parse((r, cb) => {
        const pedacos: Buffer[] = [];
        r.on("data", (c: Buffer) => pedacos.push(c));
        r.on("end", () => cb(null, Buffer.concat(pedacos)));
      })
      .expect(200);

    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe('inline; filename="contrato-ana-lima.pdf"');

    const corpo = res.body as Buffer;
    const txt = corpo.toString("latin1");
    expect(txt.startsWith("%PDF-")).toBe(true);
    expect(txt.trimEnd().endsWith("%%EOF")).toBe(true);
    // O documento carrega loja, noiva, item, forma e o plano (entrada = nº 0).
    expect(txt).toContain("Ana Lima");
    expect(txt).toContain("123.456.789-00");
    expect(txt).toContain("Vestido Sereia");
    expect(txt).toContain("Pix");
    expect(txt).toContain("Entrada");
    expect(txt).toContain("Parcela 1");
  });

  it("com desconto, o PDF mostra subtotal e desconto que reconciliam com o total", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f, { noivaNome: "Bia Desconto" });
    // Bruto 4000; 25% → líquido 3000. Sem a linha de desconto, o PDF listava
    // itens (4000) e total (3000) sem nada explicando a diferença.
    const orcamento = await criarOrcamento(f, {
      leadId: lead.id,
      status: "APROVADO",
      descontoTipo: "PERCENTUAL",
      descontoValor: 25,
    });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, descricao: "Vestido Império", valorUnitario: 4000 });

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, orcamentoId: orcamento.id, valorTotal: 3000 })
      .expect(201);

    const res = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/pdf`)
      .buffer()
      .parse((r, cb) => {
        const pedacos: Buffer[] = [];
        r.on("data", (c: Buffer) => pedacos.push(c));
        r.on("end", () => cb(null, Buffer.concat(pedacos)));
      })
      .expect(200);

    const txt = (res.body as Buffer).toString("latin1");
    expect(txt).toContain("Subtotal");
    expect(txt).toContain("Desconto");
    // Subtotal 4.000,00 − desconto 1.000,00 (25%) = total 3.000,00: fecha na conta.
    expect(txt).toContain("4.000,00");
    expect(txt).toContain("1.000,00");
    expect(txt).toContain("3.000,00");
  });

  it("404 para contrato inexistente", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await agent.get(`/api/lojas/${f.lojaId}/contratos/${randomUUID()}/pdf`).expect(404);
  });

  // Vazamento entre lojas seria vazamento de dado pessoal da noiva.
  it("404 para contrato de outra loja", async () => {
    const agentOutra = await loginComLoja(outra.vendedoraEmail, outra.lojaId);
    const lead = await criarLead(outra);
    const criado = await agentOutra
      .post(`/api/lojas/${outra.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: outra.vendedoraId, valorTotal: 500 })
      .expect(201);

    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await agent.get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/pdf`).expect(404);
  });
});
