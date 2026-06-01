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
let attrId = "";
let opPouco = "";
let opMuito = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
  leadA = (await criarLead(lojaA, { noivaNome: "Noiva A" })).id;
  leadB = (await criarLead(lojaB, { noivaNome: "Noiva B" })).id;
  // Catálogo mínimo da loja A (interesse agora se expressa via catálogo).
  const a = await prisma.atributo.create({
    data: {
      lojaId: lojaA,
      nome: "Volume da saia",
      tipo: "ESCALA",
      ordem: 0,
      opcoes: { create: [{ valor: "Pouco", ordem: 0 }, { valor: "Muito", ordem: 1 }] },
    },
    include: { opcoes: { orderBy: { ordem: "asc" } } },
  });
  attrId = a.id;
  opPouco = a.opcoes[0].id;
  opMuito = a.opcoes[1].id;
});

afterAll(async () => {
  // Apaga leads primeiro (cascade LeadInteresse → LeadInteresseAtributo) antes de
  // remover o catálogo, pra nenhum join referenciar Atributo na hora do cascade.
  await prisma.lead.deleteMany({ where: { lojaId: { in: [lojaA, lojaB] } } });
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } });
  await prisma.$disconnect();
});

describe("data layer de interesses (via catálogo)", () => {
  it("salvarInteresse cria e depois atualiza o mesmo registro, substituindo os atributos (I1)", async () => {
    const c = await salvarInteresse(lojaA, leadA, {
      tetoOrcamento: "3.500,00",
      atributos: [{ atributoId: attrId, opcaoId: opMuito }],
    });
    expect(c.tetoOrcamento?.toString()).toBe("3500");
    const lido1 = await obterNoivaComInteresse(lojaA, leadA);
    expect(lido1?.interesse?.atributos).toEqual([{ atributoId: attrId, opcaoId: opMuito }]);

    // Atualiza: mesmo registro, atributos substituídos, teto omitido volta a null.
    const u = await salvarInteresse(lojaA, leadA, {
      atributos: [{ atributoId: attrId, opcaoId: opPouco }],
    });
    expect(u.id).toBe(c.id);
    expect(u.tetoOrcamento).toBeNull();
    const lido2 = await obterNoivaComInteresse(lojaA, leadA);
    expect(lido2?.interesse?.atributos).toEqual([{ atributoId: attrId, opcaoId: opPouco }]);
    expect(await prisma.leadInteresse.count({ where: { leadId: leadA } })).toBe(1);
  });

  it("lead de outra loja é rejeitado — falha fechada (I2)", async () => {
    await expect(salvarInteresse(lojaA, leadB, { atributos: [] })).rejects.toThrow(
      "Noiva não encontrada nesta loja",
    );
    expect(await prisma.leadInteresse.count({ where: { leadId: leadB } })).toBe(0);
  });

  it("teto de orçamento inválido é rejeitado (I3)", async () => {
    await expect(salvarInteresse(lojaA, leadA, { tetoOrcamento: "abc" })).rejects.toThrow(
      "teto de orçamento válido",
    );
  });

  it("obter de outra loja → null; obter sem interesse → {lead, interesse:null} sem criar (I4)", async () => {
    expect(await obterNoivaComInteresse(lojaA, leadB)).toBeNull(); // não é da loja A
    const sem = await obterNoivaComInteresse(lojaB, leadB);
    expect(sem?.lead.id).toBe(leadB);
    expect(sem?.interesse).toBeNull();
    expect(await prisma.leadInteresse.count({ where: { leadId: leadB } })).toBe(0);
  });
});
