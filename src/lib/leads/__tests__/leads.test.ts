// src/lib/leads/__tests__/leads.test.ts
// Espelha o teste do data layer de vestidos (Prisma real, isolamento cross-loja).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { listarLeads, criarLead, obterLead, editarLead, fatosDaNoiva, estagiosDasNoivas, definirMarcoJornada } from "@/lib/leads/leads";
import { estagioDaNoiva } from "@/lib/leads/jornada";
import { tenantPrisma } from "@/lib/tenant";

const MARK = "t-noiva-";
let lojaA = "";
let lojaB = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } }); // cascade Lead
  await prisma.$disconnect();
});

describe("data layer de noivas (leads)", () => {
  it("criarLead carimba lojaId e nasce na etapa NOVO (L1)", async () => {
    const l = await criarLead(lojaA, { noivaNome: "Helena" });
    expect(l.lojaId).toBe(lojaA);
    expect(l.etapa).toBe("NOVO");
    expect(l.origem).toBe("LOJA"); // default
  });

  it("persiste campos essenciais e data em UTC (L2)", async () => {
    const l = await criarLead(lojaA, {
      noivaNome: "Marina",
      noivoNome: "Tiago",
      whatsapp: "(11) 90000-0000",
      cerimonialista: "Ana",
      casamentoData: "2026-06-20",
      casamentoHorario: "16:00",
      casamentoLocal: "Espaço Jardim",
      origem: "WHATSAPP",
    });
    expect(l.origem).toBe("WHATSAPP");
    expect(l.noivoNome).toBe("Tiago");
    expect(l.casamentoData?.toISOString()).toBe("2026-06-20T00:00:00.000Z");
    expect(l.casamentoLocal).toBe("Espaço Jardim");
  });

  it("validação: nome obrigatório, origem e data inválidas (L3)", async () => {
    await expect(criarLead(lojaA, { noivaNome: "  " })).rejects.toThrow("Nome da noiva é obrigatório");
    await expect(criarLead(lojaA, { noivaNome: "X", origem: "INSTAGRAM" })).rejects.toThrow("Origem inválida");
    await expect(criarLead(lojaA, { noivaNome: "X", casamentoData: "20/06/2026" })).rejects.toThrow(
      "Informe uma data de casamento válida",
    );
  });

  it("campos vazios viram null, não string vazia (L4)", async () => {
    const l = await criarLead(lojaA, { noivaNome: "Sem opcionais", noivoNome: "  ", whatsapp: "" });
    expect(l.noivoNome).toBeNull();
    expect(l.whatsapp).toBeNull();
    expect(l.casamentoData).toBeNull();
  });

  it("listarLeads é escopado por loja e ordenado por nome (L5)", async () => {
    await criarLead(lojaB, { noivaNome: "ZZZ-loja-b" });
    const daA = await listarLeads(lojaA);
    expect(daA.every((l) => l.lojaId === lojaA)).toBe(true);
    expect(daA.some((l) => l.noivaNome === "ZZZ-loja-b")).toBe(false);
    const nomes = daA.map((l) => l.noivaNome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
  });

  it("editarLead altera campos e não re-tenanta (L6)", async () => {
    const l = await criarLead(lojaA, { noivaNome: "Antes", origem: "LOJA" });
    const e = await editarLead(lojaA, l.id, {
      noivaNome: "Depois",
      noivoNome: "Caio",
      casamentoData: "2027-01-02",
      origem: "WHATSAPP",
    });
    expect(e.id).toBe(l.id);
    expect(e.noivaNome).toBe("Depois");
    expect(e.noivoNome).toBe("Caio");
    expect(e.origem).toBe("WHATSAPP");
    expect(e.casamentoData?.toISOString()).toBe("2027-01-02T00:00:00.000Z");
    expect(e.lojaId).toBe(lojaA);
    expect(e.etapa).toBe(l.etapa); // editar não mexe na etapa
  });

  it("não edita nem lê lead de outra loja — guard cross-loja (L7)", async () => {
    const doB = await criarLead(lojaB, { noivaNome: "Da loja B" });
    // ler pela loja errada → null:
    expect(await obterLead(lojaA, doB.id)).toBeNull();
    expect(await obterLead(lojaB, doB.id)).not.toBeNull();
    // editar pela loja errada → lança (P2025), e a linha não muda:
    await expect(editarLead(lojaA, doB.id, { noivaNome: "Invasão" })).rejects.toThrow();
    const intacto = await obterLead(lojaB, doB.id);
    expect(intacto?.noivaNome).toBe("Da loja B");
  });
});

describe("jornada derivada (fatos + marcos)", () => {
  const MARK = "t-jornada-";
  let loja = "";
  let leadId = "";

  beforeAll(async () => {
    loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
    leadId = (await tenantPrisma(prisma, loja).lead.create({
      data: { noivaNome: `${MARK}Ana` } as never,
    })).id;
  });
  afterAll(async () => {
    await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  });

  it("noiva recém-cadastrada → estágio 'cadastrada'", async () => {
    const f = await fatosDaNoiva(loja, leadId);
    expect(f).not.toBeNull();
    expect(estagioDaNoiva(f!).atual).toBe("cadastrada");
  });

  it("marco manual de orçamento liga e desliga (idempotente, escopado)", async () => {
    await definirMarcoJornada(loja, leadId, "orcamentoAbertoEm", true);
    let f = await fatosDaNoiva(loja, leadId);
    expect(f!.orcamentoAbertoEm).not.toBeNull();
    expect(estagioDaNoiva(f!).atual).toBe("orcamento_aberto");

    await definirMarcoJornada(loja, leadId, "orcamentoAbertoEm", false);
    f = await fatosDaNoiva(loja, leadId);
    expect(f!.orcamentoAbertoEm).toBeNull();
  });

  it("estagiosDasNoivas mapeia a loja inteira", async () => {
    const mapa = await estagiosDasNoivas(loja);
    expect(mapa.get(leadId)?.atual).toBeDefined();
  });

  it("marco de outra loja é no-op (escopo)", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
    await definirMarcoJornada(outra, leadId, "perdidaEm", true); // lead é da `loja`, não da `outra`
    const f = await fatosDaNoiva(loja, leadId);
    expect(f!.perdidaEm).toBeNull(); // não marcou nada
  });
});
