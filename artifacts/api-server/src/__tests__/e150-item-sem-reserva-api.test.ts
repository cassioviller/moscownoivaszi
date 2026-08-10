import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarVestido,
  criarLead,
  criarBloqueio,
  criarOrcamento,
  criarOrcamentoItem,
  dataFutura,
  type Fixture,
} from "./helpers";

/**
 * E150 — o contrato não vende peça que não reservou.
 *
 * O que este arquivo prega, e por quê: `itensSnapshot` (o que foi VENDIDO) e
 * `bloqueioVestidoIds` (o que foi RESERVADO) chegam de fontes independentes —
 * os itens vêm do orçamento, os bloqueios vêm do corpo. Nada obrigava as duas
 * listas a falarem da mesma peça, e o schema declara a descrição em texto como
 * registro autoritativo (`contratos.ts:66-69`). Um item apontando `vestidoId`
 * sem reserva fechava com 201 e deixava a peça livre para a próxima noiva do
 * mesmo sábado.
 *
 * O caderno do ateliê mostra o caso real: `Bolero Ricca Sposa` sai em duas
 * semanas distintas, para noivas diferentes. É peça, e peça se reserva.
 */
describe("E150 — peça vendida exige reserva no mesmo contrato", () => {
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

  /** Orçamento aprovado com um item que aponta uma peça do acervo. */
  async function orcamentoComPeca(leadId: string, tipo: "VESTIDO" | "ACESSORIO") {
    const vestido = await criarVestido(f);
    const orcamento = await criarOrcamento(f, { leadId, status: "APROVADO" });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo,
      vestidoId: vestido.id,
      descricao: tipo === "ACESSORIO" ? "Bolero Ricca Sposa" : "Vestido Arnalda",
      valorUnitario: 4000,
      quantidade: 1,
    });
    return { vestido, orcamento };
  }

  it("vender VESTIDO sem reservar a peça é recusado com 422 que nomeia o item", async () => {
    const lead = await criarLead(f);
    const { orcamento } = await orcamentoComPeca(lead.id, "VESTIDO");

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 4000,
        // sem bloqueioVestidoIds — é exatamente o defeito
      })
      .expect(422);

    expect(r.body.error).toBe("ITEM_SEM_RESERVA");
    // A frase serve à vendedora: diz o RISCO, não o nome da coluna.
    expect(r.body.detalhe).toMatch(/outra noiva/i);
    expect(r.body.campos?.[0]?.motivo).toMatch(/Vestido Arnalda/);
  });

  it("o ACESSÓRIO tem a mesma régua do vestido — é peça, e peça se reserva", async () => {
    const lead = await criarLead(f);
    const { orcamento } = await orcamentoComPeca(lead.id, "ACESSORIO");

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 4000,
      })
      .expect(422);

    expect(r.body.error).toBe("ITEM_SEM_RESERVA");
    expect(r.body.campos?.[0]?.motivo).toMatch(/Bolero Ricca Sposa/);
  });

  it("com a reserva da peça no mesmo contrato, fecha em 201", async () => {
    const lead = await criarLead(f);
    const { vestido, orcamento } = await orcamentoComPeca(lead.id, "ACESSORIO");
    const casamento = dataFutura(120);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: casamento,
    });

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 4000,
        dataCasamento: casamento,
        bloqueioVestidoIds: [bloqueio.id],
      })
      .expect(201);
  });

  it("reservar OUTRA peça não vale — a régua é por peça, não por contagem", async () => {
    const lead = await criarLead(f);
    const { orcamento } = await orcamentoComPeca(lead.id, "VESTIDO");
    const casamento = dataFutura(150);
    // Uma reserva existe, mas é de uma peça que o contrato não vende.
    const outraPeca = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: (await criarVestido(f)).id,
      leadId: lead.id,
      casamentoData: casamento,
    });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 4000,
        dataCasamento: casamento,
        bloqueioVestidoIds: [outraPeca.id],
      })
      .expect(422);

    expect(r.body.error).toBe("ITEM_SEM_RESERVA");
  });

  it("SERVIÇO e AJUSTE seguem passando sem reserva — não são peça física", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "SERVICO",
      descricao: "Ajuste de barra",
      valorUnitario: 300,
      quantidade: 1,
    });

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 300,
      })
      .expect(201);
  });

  it("item de descrição livre (sem vestidoId) não trava a venda", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "APROVADO" });
    // Exigir reserva de algo que não está no acervo travaria a venda por uma
    // frase — a guarda só morde quando o item JÁ aponta uma peça.
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "ACESSORIO",
      vestidoId: null,
      descricao: "Mantilha emprestada da coleção antiga",
      valorUnitario: 200,
      quantidade: 1,
    });

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        orcamentoId: orcamento.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 200,
      })
      .expect(201);
  });
});
