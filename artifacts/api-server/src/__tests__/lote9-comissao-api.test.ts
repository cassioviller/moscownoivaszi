import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, contasPagarTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarContrato,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

// Datas literais ancoradas por competência (meio-dia São Paulo — offset fixo).
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("Lote 9 — fechamento de comissão", () => {
  let f: Fixture;
  // Agent do superadmin (módulo comissao); criado no beforeAll.
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    // Faixas da loja: 5k→5%, 10k→8%.
    await agent.post(`/api/lojas/${f.lojaId}/comissao/faixas`).send({ minimoVenda: 5000, percentual: 5 }).expect(201);
    await agent.post(`/api/lojas/${f.lojaId}/comissao/faixas`).send({ minimoVenda: 10000, percentual: 8 }).expect(201);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("GET faixas responde 200 com o shape do banco (antes 500 ZodError)", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/comissao/faixas`).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toHaveProperty("minimoVenda");
    expect(res.body[0]).toHaveProperty("percentual");
  });

  it("fechamento calcula vendas reais × faixa e gera conta a pagar vinculada", async () => {
    const lead1 = await criarLead(f);
    const lead2 = await criarLead(f);
    // 3000 + 7000 = 10000 em 2027-03 → faixa de 8% sobre o total = 800.
    await criarContrato(f, { leadId: lead1.id, valorTotal: 3000, fechadoEm: dia("2027-03-05") });
    await criarContrato(f, { leadId: lead2.id, valorTotal: 7000, fechadoEm: dia("2027-03-20") });

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2027-03" })
      .expect(201);

    expect(res.body).toHaveLength(1);
    const fechamento = res.body[0];
    expect(fechamento.usuarioId).toBe(f.vendedoraId);
    expect(fechamento.totalVendas).toBe(10000);
    expect(fechamento.comissaoValor).toBe(800);
    expect(fechamento.contaPagarId).toBeTruthy();

    const [conta] = await db.select().from(contasPagarTable)
      .where(eq(contasPagarTable.id, fechamento.contaPagarId));
    expect(conta.tipo).toBe("COMISSAO");
    expect(conta.valorPrevisto).toBe(800);
    expect(conta.competencia).toBe("2027-03");
    expect(conta.colaboradorId).toBe(f.vendedoraId);
    expect(conta.origemComissaoFechamentoId).toBe(fechamento.id);
    // Vencimento: dia 5 do mês seguinte.
    expect(conta.vencimento.toISOString()).toBe("2027-04-05T15:00:00.000Z");
  });

  it("competência repetida → 409 e nada é regravado", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2027-03" })
      .expect(409);
    expect(res.body.error).toBe("COMPETENCIA_JA_FECHADA");

    const contas = await db.select().from(contasPagarTable)
      .where(and(eq(contasPagarTable.lojaId, f.lojaId), eq(contasPagarTable.competencia, "2027-03")));
    expect(contas).toHaveLength(1);
  });

  it("contrato cancelado na própria competência nunca entra na base", async () => {
    const lead = await criarLead(f);
    await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 9000,
      fechadoEm: dia("2027-05-10"),
      comissaoEstornadaEm: dia("2027-05-20"),
    });

    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2027-05" })
      .expect(201);
    // Há movimento (o estorno interno zera a base) → fechamento com 0.
    expect(res.body[0].totalVendas).toBe(0);
    expect(res.body[0].comissaoValor).toBe(0);
    expect(res.body[0].contaPagarId).toBeNull();
  });

  it("estorno de competência anterior subtrai; base negativa → comissão 0 sem conta", async () => {
    const leadA = await criarLead(f);
    const leadB = await criarLead(f);
    // A: fechado em 2027-06 (comissão computada lá), cancelado em 2027-07.
    await criarContrato(f, {
      leadId: leadA.id,
      valorTotal: 12000,
      fechadoEm: dia("2027-06-10"),
      comissaoEstornadaEm: dia("2027-07-08"),
    });
    // B: venda nova de 5000 em 2027-07.
    await criarContrato(f, { leadId: leadB.id, valorTotal: 5000, fechadoEm: dia("2027-07-15") });

    // Fecha 2027-06 primeiro: A ainda ativo naquela competência → 12000 × 8%.
    const junho = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2027-06" })
      .expect(201);
    expect(junho.body[0].totalVendas).toBe(12000);
    expect(junho.body[0].comissaoValor).toBe(960);

    // 2027-07: 5000 − 12000 = −7000 → comissão 0, sem conta a pagar.
    const julho = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2027-07" })
      .expect(201);
    expect(julho.body[0].totalVendas).toBe(-7000);
    expect(julho.body[0].comissaoValor).toBe(0);
    expect(julho.body[0].contaPagarId).toBeNull();
  });

  it("competência sem movimento → 422", async () => {
    const res = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2030-01" })
      .expect(422);
    expect(res.body.error).toBe("SEM_MOVIMENTO");
  });
});
