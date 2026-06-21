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

  // Criados PELO guard (carimba lojaId da sessão):
  //   A → 2 vestidos, 1 noiva   |   B → 1 vestido, 2 noivas.
  const dbA = tenantPrisma(prisma, lojaA);
  const dbB = tenantPrisma(prisma, lojaB);
  await dbA.vestido.create({ data: { codigo: "A1", nome: `${MARK}a1`, precoBase: "100.00" } as any });
  await dbA.vestido.create({ data: { codigo: "A2", nome: `${MARK}a2`, precoBase: "200.00" } as any });
  await dbB.vestido.create({ data: { codigo: "B1", nome: `${MARK}b1`, precoBase: "300.00" } as any });
  await dbA.lead.create({ data: { noivaNome: `${MARK}noivaA1` } as any });
  await dbB.lead.create({ data: { noivaNome: `${MARK}noivaB1` } as any });
  await dbB.lead.create({ data: { noivaNome: `${MARK}noivaB2` } as any });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await prisma.$disconnect();
});

describe("carregarResumoLoja — leitura escopada pelo guard", () => {
  it("conta vestidos e noivas da loja pedida (T-count)", async () => {
    expect(await carregarResumoLoja(lojaA)).toEqual({ vestidos: 2, noivas: 1 });
  });

  it("zero-vazamento: loja A nunca vê vestidos/noivas de B (T-isolamento)", async () => {
    const resumoB = await carregarResumoLoja(lojaB);
    expect(resumoB).toEqual({ vestidos: 1, noivas: 2 }); // não 3 vestidos, não 3 noivas
  });

  it("loja sem dados retorna zero em ambos (T-zero)", async () => {
    const vazia = await prisma.loja.create({ data: { nome: `${MARK}vazia` } });
    try {
      expect(await carregarResumoLoja(vazia.id)).toEqual({ vestidos: 0, noivas: 0 });
    } finally {
      await prisma.loja.delete({ where: { id: vazia.id } });
    }
  });
});
