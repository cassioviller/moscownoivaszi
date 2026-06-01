// src/lib/loja/__tests__/resumo.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { carregarResumoLoja } from "@/lib/loja/resumo";

const MARK = "t-rl-";
let lojaA = "";
let lojaB = "";

beforeAll(async () => {
  const a = await prisma.loja.create({ data: { nome: `${MARK}A` } });
  const b = await prisma.loja.create({ data: { nome: `${MARK}B` } });
  lojaA = a.id;
  lojaB = b.id;

  // 2 vestidos na A, 1 na B — criados PELO guard (carimba lojaId da sessão).
  const dbA = tenantPrisma(prisma, lojaA);
  const dbB = tenantPrisma(prisma, lojaB);
  await dbA.vestido.create({ data: { codigo: "A1", nome: `${MARK}a1`, precoBase: "100.00" } as any });
  await dbA.vestido.create({ data: { codigo: "A2", nome: `${MARK}a2`, precoBase: "200.00" } as any });
  await dbB.vestido.create({ data: { codigo: "B1", nome: `${MARK}b1`, precoBase: "300.00" } as any });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await prisma.$disconnect();
});

describe("carregarResumoLoja — leitura escopada pelo guard", () => {
  it("conta só os vestidos da loja pedida (T-count)", async () => {
    expect(await carregarResumoLoja(lojaA)).toEqual({ vestidos: 2 });
  });

  it("zero-vazamento: loja A nunca vê os vestidos de B (T-isolamento)", async () => {
    const resumoB = await carregarResumoLoja(lojaB);
    expect(resumoB).toEqual({ vestidos: 1 }); // não 3
  });

  it("loja sem vestidos retorna 0 (T-zero)", async () => {
    const vazia = await prisma.loja.create({ data: { nome: `${MARK}vazia` } });
    try {
      expect(await carregarResumoLoja(vazia.id)).toEqual({ vestidos: 0 });
    } finally {
      await prisma.loja.delete({ where: { id: vazia.id } });
    }
  });
});
