// Unit (puro): faixaDeAtraso classifica por dias; linkWhatsApp monta o deep-link wa.me.
import { describe, it, expect } from "vitest";
import { faixaDeAtraso, linkWhatsApp, agingDaLoja, historicoCobranca, registrarCobranca } from "@/lib/financeiro/cobranca";

describe("faixaDeAtraso", () => {
  it("1 e 30 dias → ate30", () => {
    expect(faixaDeAtraso(1)).toBe("ate30");
    expect(faixaDeAtraso(30)).toBe("ate30");
  });
  it("31 e 60 dias → d31a60", () => {
    expect(faixaDeAtraso(31)).toBe("d31a60");
    expect(faixaDeAtraso(60)).toBe("d31a60");
  });
  it("61+ dias → mais60", () => {
    expect(faixaDeAtraso(61)).toBe("mais60");
    expect(faixaDeAtraso(200)).toBe("mais60");
  });
});

describe("linkWhatsApp", () => {
  it("monta wa.me com DDI 55 e mensagem encodada", () => {
    expect(linkWhatsApp("(11) 99999-8888", "Olá Ana!")).toBe("https://wa.me/5511999998888?text=Ol%C3%A1%20Ana!");
  });
  it("mantém o número que já vem com DDI 55", () => {
    expect(linkWhatsApp("55 11 99999-8888", "oi")).toBe("https://wa.me/5511999998888?text=oi");
  });
  it("sem whatsapp ou número implausível → null", () => {
    expect(linkWhatsApp(null, "x")).toBeNull();
    expect(linkWhatsApp("", "x")).toBeNull();
    expect(linkWhatsApp("123", "x")).toBeNull();
  });
});

import { beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { hojeUTC } from "@/lib/tempo";

const MARK = "t-cobranca-";
let loja = "";
let noivaA = "";
let noivaB = "";
let vend = "";

const hoje = hojeUTC();
const venc = (diasAtras: number) => { const d = new Date(hoje.getTime()); d.setUTCDate(d.getUTCDate() - diasAtras); return d; };

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noivaA = (await db.lead.create({ data: { noivaNome: `${MARK}Ana`, whatsapp: "(11) 99999-8888", etapa: "NOVO" } as never })).id;
  noivaB = (await db.lead.create({ data: { noivaNome: `${MARK}Bia`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${noivaA}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const cA = await db.contrato.create({ data: { leadId: noivaA, vendedoraId: vend, valorTotal: 9999 } as never });
  const cB = await db.contrato.create({ data: { leadId: noivaB, vendedoraId: vend, valorTotal: 9999 } as never });
  await db.parcela.create({ data: { contratoId: cA.id, numero: 1, valorPrevisto: 1000, vencimento: venc(10) } as never });
  await db.parcela.create({ data: { contratoId: cA.id, numero: 2, valorPrevisto: 500, vencimento: venc(80) } as never });
  await db.parcela.create({ data: { contratoId: cB.id, numero: 1, valorPrevisto: 700, vencimento: venc(40) } as never });
  await db.parcela.create({ data: { contratoId: cA.id, numero: 3, valorPrevisto: 300, vencimento: venc(5), status: "PAGA", valorRecebido: 300, recebidoEm: venc(5) } as never });
  const futuro = new Date(hoje.getTime()); futuro.setUTCDate(futuro.getUTCDate() + 20);
  await db.parcela.create({ data: { contratoId: cA.id, numero: 4, valorPrevisto: 999, vencimento: futuro } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("agingDaLoja", () => {
  it("agrupa por noiva, ordenado pelo atraso mais antigo, ignorando paga/futura", async () => {
    const a = await agingDaLoja(loja);
    expect(a.noivas[0].noivaNome).toBe(`${MARK}Ana`);
    const ana = a.noivas.find((n) => n.leadId === noivaA)!;
    expect(ana.qtdParcelas).toBe(2);
    expect(ana.totalVencido).toBe("1500.00");
    expect(ana.faixaMaisAntiga).toBe("mais60");
    expect(ana.whatsapp).toBe("(11) 99999-8888");
  });
  it("soma as faixas com cada parcela no seu próprio atraso", async () => {
    const a = await agingDaLoja(loja);
    expect(a.faixas.ate30.total).toBe("1000.00");
    expect(a.faixas.d31a60.total).toBe("700.00");
    expect(a.faixas.mais60.total).toBe("500.00");
    expect(a.faixas.d31a60.qtdNoivas).toBe(1);
  });
});

describe("registrarCobranca + historicoCobranca", () => {
  it("registra e lista recente-primeiro", async () => {
    const r1 = await registrarCobranca(loja, { leadId: noivaA, canal: "WHATSAPP", observacao: "prometeu pagar dia 15" });
    expect(r1).toEqual({ ok: true });
    const r2 = await registrarCobranca(loja, { leadId: noivaA, canal: "TELEFONE" });
    expect(r2).toEqual({ ok: true });
    const h = await historicoCobranca(loja, noivaA);
    expect(h).toHaveLength(2);
    expect(h.every((c) => ["WHATSAPP", "TELEFONE"].includes(c.canal))).toBe(true);
  });
  it("rejeita lead de outra loja e canal inválido", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
    expect(await registrarCobranca(outra, { leadId: noivaA, canal: "WHATSAPP" })).toEqual({ ok: false, motivo: "lead_invalido" });
    expect(await registrarCobranca(loja, { leadId: noivaA, canal: "EMAIL" })).toEqual({ ok: false, motivo: "canal_invalido" });
  });
});
