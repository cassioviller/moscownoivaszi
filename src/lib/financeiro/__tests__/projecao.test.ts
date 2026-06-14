// Unit (puro): montarCurva aplica eventos por dia sobre um saldo de partida (centavos).
import { describe, it, expect } from "vitest";
import { montarCurva, projecaoCaixa, type EventoDia } from "@/lib/financeiro/projecao";

const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ev = (ymd: string, entradasC: number, saidasC: number): EventoDia => ({ ymd, data: d(ymd), entradasC, saidasC });

describe("montarCurva", () => {
  it("sem eventos: curva vazia, sem dia negativo, menor saldo = saldo de hoje", () => {
    const c = montarCurva(800000, []);
    expect(c.linhas).toEqual([]);
    expect(c.diaNegativo).toBeNull();
    expect(c.menorSaldo).toEqual({ data: null, valor: "8000.00" });
  });

  it("fica negativo num dia → diaNegativo é aquele dia", () => {
    const c = montarCurva(100000, [ev("2026-06-20", 0, 250000)]);
    expect(c.linhas[0].saldoApos).toBe("-1500.00");
    expect(c.diaNegativo).toEqual(d("2026-06-20"));
  });

  it("afunda e recupera depois → menor saldo é no fundo, não no fim", () => {
    const c = montarCurva(500000, [ev("2026-06-15", 0, 400000), ev("2026-06-25", 600000, 0)]);
    expect(c.linhas.at(-1)!.saldoApos).toBe("7000.00");
    expect(c.menorSaldo).toEqual({ data: d("2026-06-15"), valor: "1000.00" });
  });

  it("borda exatamente zero não conta como negativa", () => {
    const c = montarCurva(300000, [ev("2026-06-18", 0, 300000)]);
    expect(c.linhas[0].saldoApos).toBe("0.00");
    expect(c.diaNegativo).toBeNull();
  });

  it("dois eventos no mesmo dia somam numa linha só", () => {
    const c = montarCurva(0, [ev("2026-06-12", 150000, 0), ev("2026-06-12", 0, 50000)]);
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0]).toMatchObject({ entradas: "1500.00", saidas: "500.00", saldoApos: "1000.00" });
  });
});

import { beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC, ymd } from "@/lib/tempo";
import { definirSaldoReferencia } from "@/lib/financeiro/saldo-referencia";

const MARK = "t-projecao-";
let lojaP = "";
let noivaP = "";
let vendP = "";

const hojeP = hojeUTC();
const maisP = (n: number) => { const d = new Date(hojeP.getTime()); d.setUTCDate(d.getUTCDate() + n); return d; };
const menosP = (n: number) => maisP(-n);

beforeAll(async () => {
  lojaP = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, lojaP);
  noivaP = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${noivaP}@x.local`, senhaHash: "x" } });
  vendP = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: lojaP, perfilId: "perfil-vendedora" } });
  await definirSaldoReferencia(lojaP, { data: ymd(hojeP)!, valor: "8000,00" });
  const contrato = await db.contrato.create({ data: { leadId: noivaP, vendedoraId: vendP, valorTotal: 9999 } as never });
  // Recebível DENTRO do horizonte (hoje+10) e contas DENTRO (hoje+15).
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 1, valorPrevisto: 1500, vencimento: maisP(10) } as never });
  await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}Aluguel`, valorPrevisto: 3000, vencimento: maisP(15) } as never });
  // Recebível FORA do horizonte (hoje+200) — não entra na curva de 90 dias.
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 2, valorPrevisto: 5000, vencimento: maisP(200) } as never });
  // Vencidos em aberto (hoje-3 receber; hoje-2 pagar) — vão para emAtraso, não para a curva.
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 3, valorPrevisto: 2000, vencimento: menosP(3) } as never });
  await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}Atrasada`, valorPrevisto: 1200, vencimento: menosP(2) } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("projecaoCaixa", () => {
  it("saldo de hoje vem da âncora", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 90 });
    expect(p.saldoHoje).toBe("8000.00");
  });

  it("a curva inclui o que vence dentro do horizonte e exclui o que vence fora", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 90 });
    const dias = p.curva.linhas.map((l) => ymd(l.data));
    expect(dias).toContain(ymd(maisP(10))); // recebível dentro
    expect(dias).toContain(ymd(maisP(15))); // conta dentro
    expect(dias).not.toContain(ymd(maisP(200))); // fora do horizonte
  });

  it("os vencidos em aberto vão para emAtraso, nunca para a curva", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 90 });
    const dias = p.curva.linhas.map((l) => ymd(l.data));
    expect(dias).not.toContain(ymd(menosP(3)));
    expect(dias).not.toContain(ymd(menosP(2)));
    expect(p.emAtraso.aReceber).toBe("2000.00");
    expect(p.emAtraso.aPagar).toBe("1200.00");
  });

  it("horizonte inválido cai para 90", async () => {
    const p = await projecaoCaixa(lojaP, { horizonteDias: 7 });
    expect(p.horizonteDias).toBe(90);
  });
});
