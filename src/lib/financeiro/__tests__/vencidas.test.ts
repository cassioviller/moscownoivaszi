// Integração: vencidasDaLoja conta/soma PREVISTA com vencimento < hoje.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { vencidasDaLoja } from "@/lib/financeiro/vencidas";

const MARK = "t-venc-";
let loja = "";
let noiva = "";
let vendedora = "";
const hoje = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00:00.000Z`);
const ontem = new Date(hoje.getTime());
ontem.setUTCDate(ontem.getUTCDate() - 1);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}N`, etapa: "NOVO" } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}V`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vendedora = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const contrato = await db.contrato.create({ data: { leadId: noiva, vendedoraId: vendedora, valorTotal: 1000 } as never });
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 1, valorPrevisto: 300, vencimento: ontem } as never });
  await db.parcela.create({ data: { contratoId: contrato.id, numero: 2, valorPrevisto: 700, vencimento: ontem, status: "PAGA" } as never });
  await db.contaPagar.create({ data: { tipo: "DESPESA", descricao: `${MARK}x`, valorPrevisto: 150, vencimento: ontem } as never });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("vencidasDaLoja", () => {
  it("conta só PREVISTA com vencimento < hoje", async () => {
    const v = await vencidasDaLoja(loja, hoje);
    expect(v.receberQtd).toBe(1);
    expect(v.receberTotal).toBe("300.00");
    expect(v.pagarQtd).toBe(1);
    expect(v.pagarTotal).toBe("150.00");
  });
});
