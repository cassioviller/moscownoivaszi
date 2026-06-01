// src/lib/leads/__tests__/interesses.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { criarLead } from "@/lib/leads/leads";
import { obterNoivaComInteresse, salvarInteresse } from "@/lib/leads/interesses";

const MARK = "t-interesse-";
let lojaA = "";
let lojaB = "";
let leadA = "";
let leadB = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
  leadA = (await criarLead(lojaA, { noivaNome: "Noiva A" })).id;
  leadB = (await criarLead(lojaB, { noivaNome: "Noiva B" })).id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } }); // cascade Lead → LeadInteresse
  await prisma.$disconnect();
});

describe("data layer de interesses (escalares)", () => {
  it("salvarInteresse cria e depois atualiza o mesmo registro (upsert por leadId) (I1)", async () => {
    const c = await salvarInteresse(lojaA, leadA, { volumeSaia: "MUITO", fenda: "TALVEZ", tetoOrcamento: "3.500,00" });
    expect(c.volumeSaia).toBe("MUITO");
    expect(c.fenda).toBe("TALVEZ");
    expect(c.tetoOrcamento?.toString()).toBe("3500");
    const u = await salvarInteresse(lojaA, leadA, { volumeSaia: "POUCO", brilho: "MEDIO" });
    expect(u.id).toBe(c.id); // mesmo registro
    expect(u.volumeSaia).toBe("POUCO");
    expect(u.tetoOrcamento).toBeNull(); // campo omitido volta a null
    const n = await prisma.leadInteresse.count({ where: { leadId: leadA } });
    expect(n).toBe(1);
  });

  it("lead de outra loja é rejeitado — falha fechada (I2)", async () => {
    await expect(salvarInteresse(lojaA, leadB, { volumeSaia: "POUCO" })).rejects.toThrow(
      "Noiva não encontrada nesta loja",
    );
    // e nenhum registro vazou para o lead da loja B
    expect(await prisma.leadInteresse.count({ where: { leadId: leadB } })).toBe(0);
  });

  it("validação de escala/fenda/teto inválidos (I3)", async () => {
    await expect(salvarInteresse(lojaA, leadA, { volumeSaia: "ENORME" })).rejects.toThrow("escala inválido");
    await expect(salvarInteresse(lojaA, leadA, { fenda: "QUEM SABE" })).rejects.toThrow("fenda inválido");
    await expect(salvarInteresse(lojaA, leadA, { tetoOrcamento: "abc" })).rejects.toThrow(
      "teto de orçamento válido",
    );
  });

  it("obter de outra loja → null; obter sem interesse → {lead, interesse:null} sem criar (I4)", async () => {
    expect(await obterNoivaComInteresse(lojaA, leadB)).toBeNull(); // não é da loja A
    const sem = await obterNoivaComInteresse(lojaB, leadB);
    expect(sem?.lead.id).toBe(leadB);
    expect(sem?.interesse).toBeNull();
    // visita não criou registro:
    expect(await prisma.leadInteresse.count({ where: { leadId: leadB } })).toBe(0);
  });
});
