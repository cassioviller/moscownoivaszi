import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, parcelasTable, pagamentosTable, contasPagarTable, pagamentoItensTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  criarContrato,
  type Fixture,
} from "./helpers";

/**
 * E79 — o DRE agregado no banco, pelo MESMO motor do fluxo (financeiro-core).
 * O invariante central é o cuidado (a) da proposta: fluxo e DRE fecham entre
 * si período a período PORQUE saem do mesmo lugar — e aqui isso vira asserção
 * contra os dois endpoints, não contra a implementação.
 */
describe("GET /financeiro/dre (E79)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  const hoje = new Date();
  const ymd = (d: Date) => {
    const local = new Date(d.getTime() - 3 * 3_600_000);
    return local.toISOString().slice(0, 10);
  };
  const competencia = ymd(hoje).slice(0, 7);

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: hoje,
    });

    await db.insert(parcelasTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        valorPrevisto: 1000,
        vencimento: hoje,
        status: "PAGA",
        valorRecebido: 1000,
        recebidoEm: hoje,
        formaRecebimento: "PIX",
      },
      {
        // Parcial (E49): só o RECEBIDO entra na receita.
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 2,
        valorPrevisto: 800,
        vencimento: hoje,
        status: "PARCIAL",
        valorRecebido: 300,
        recebidoEm: hoje,
        formaRecebimento: "DINHEIRO",
      },
    ]);

    // Duas contas pagas num pagamento só: uma com categoria livre, outra caindo
    // no rótulo do tipo — os dois caminhos do `rotuloCategoria`.
    const contaAluguel = randomUUID();
    const contaFornecedor = randomUUID();
    await db.insert(contasPagarTable).values([
      {
        id: contaAluguel,
        lojaId: f.lojaId,
        tipo: "DESPESA",
        descricao: "Aluguel do atelier",
        categoria: "Aluguel",
        valorPrevisto: 150,
        vencimento: hoje,
        status: "PAGA",
      },
      {
        id: contaFornecedor,
        lojaId: f.lojaId,
        tipo: "FORNECEDOR",
        descricao: "Tecidos",
        valorPrevisto: 100,
        vencimento: hoje,
        status: "PAGA",
      },
    ]);
    const pagamentoId = randomUUID();
    await db.insert(pagamentosTable).values({
      id: pagamentoId,
      lojaId: f.lojaId,
      data: hoje,
      valorPago: 250,
    });
    await db.insert(pagamentoItensTable).values([
      { id: randomUUID(), lojaId: f.lojaId, pagamentoId, contaPagarId: contaAluguel, valor: 150 },
      { id: randomUUID(), lojaId: f.lojaId, pagamentoId, contaPagarId: contaFornecedor, valor: 100 },
    ]);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("receitas, despesas por categoria e porMeio fecham entre si", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/dre?competencia=${competencia}`)
      .expect(200);

    const dre = res.body;
    expect(dre.competencia).toBe(competencia);
    expect(dre.receitas).toBe(1300);

    // Categoria livre e rótulo do tipo, maior total primeiro.
    expect(dre.despesas).toEqual([
      { rotulo: "Aluguel", total: 150 },
      { rotulo: "Fornecedores", total: 100 },
    ]);
    expect(dre.totalDespesas).toBe(250);
    expect(dre.resultado).toBe(1050);

    // A régua do E50: o MESMO dinheiro das receitas, por meio.
    expect(dre.porMeio.total).toBe(dre.receitas);
    const pix = dre.porMeio.linhas.find((l: { forma: string | null }) => l.forma === "PIX");
    expect(pix.total).toBe(1000);
  });

  it("DRE fecha com o fluxo na mesma competência — mesmo motor, mesmos números", async () => {
    const [dreRes, fluxoRes] = await Promise.all([
      agent.get(`/api/lojas/${f.lojaId}/financeiro/dre?competencia=${competencia}`).expect(200),
      agent
        .get(
          `/api/lojas/${f.lojaId}/financeiro/fluxo?ini=${dreIni(competencia)}&fim=${dreFim(competencia)}`,
        )
        .expect(200),
    ]);

    expect(dreRes.body.receitas).toBe(fluxoRes.body.resumo.entradas);
    expect(dreRes.body.totalDespesas).toBe(fluxoRes.body.resumo.saidas);
    expect(dreRes.body.porMeio).toEqual(fluxoRes.body.porMeio);
  });

  it("competência sem movimento devolve zeros, não null", async () => {
    const res = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/dre?competencia=2020-01`)
      .expect(200);
    expect(res.body.receitas).toBe(0);
    expect(res.body.despesas).toEqual([]);
    expect(res.body.totalDespesas).toBe(0);
    expect(res.body.resultado).toBe(0);
    expect(res.body.porMeio).toEqual({ total: 0, linhas: [] });
  });

  it("sem competência cai no mês corrente", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/financeiro/dre`).expect(200);
    expect(res.body.competencia).toBe(competencia);
    expect(res.body.intervalo.iniYMD).toBe(`${competencia}-01`);
  });
});

/** Primeiro e último dia da competência — a mesma régua do intervaloDaCompetencia. */
function dreIni(comp: string): string {
  return `${comp}-01`;
}
function dreFim(comp: string): string {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${comp}-${String(ultimo).padStart(2, "0")}`;
}
