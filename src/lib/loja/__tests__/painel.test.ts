// src/lib/loja/__tests__/painel.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { carregarPainel } from "@/lib/loja/painel";

const MARK = "t-painel-";
let loja = "";
let outra = "";

// Mesma convenção do painel: meia-noite UTC do dia de hoje em SP.
const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const hoje = new Date(`${ymd}T00:00:00.000Z`);
const emDias = (n: number) => new Date(hoje.getTime() + n * 86_400_000);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  const db = tenantPrisma(prisma, loja);

  // 3 NOVO (uma com casamento em 10d, uma em 40d), 1 EM_PROVAS (casamento em 20d),
  // 1 PERDIDO e 1 CASAMENTO_REALIZADO (encerradas; esta com casamento no passado).
  await db.lead.create({ data: { noivaNome: `${MARK}n1`, etapa: "NOVO" } as any });
  await db.lead.create({ data: { noivaNome: `${MARK}n2`, etapa: "NOVO", casamentoData: emDias(10) } as any });
  await db.lead.create({ data: { noivaNome: `${MARK}n3`, etapa: "NOVO", casamentoData: emDias(40) } as any });
  await db.lead.create({ data: { noivaNome: `${MARK}p1`, etapa: "EM_PROVAS", casamentoData: emDias(20) } as any });
  await db.lead.create({ data: { noivaNome: `${MARK}x1`, etapa: "PERDIDO" } as any });
  await db.lead.create({ data: { noivaNome: `${MARK}c1`, etapa: "CASAMENTO_REALIZADO", casamentoData: emDias(-5) } as any });

  await db.vestido.create({ data: { codigo: "P1", nome: `${MARK}v1`, precoBase: "100.00" } as any });
  await db.vestido.create({ data: { codigo: "P2", nome: `${MARK}v2`, precoBase: "200.00" } as any });
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { lojaId: { in: [loja, outra] } } });
  await prisma.vestido.deleteMany({ where: { lojaId: { in: [loja, outra] } } });
  await prisma.loja.deleteMany({ where: { id: { in: [loja, outra] } } });
  await prisma.$disconnect();
});

describe("carregarPainel — dashboard com dados reais", () => {
  it("conta noivas ativas (exclui encerradas), acervo e em provas", async () => {
    const p = await carregarPainel(loja);
    expect(p.noivasAtivas).toBe(4); // 3 NOVO + 1 EM_PROVAS (PERDIDO/CASAMENTO fora)
    expect(p.vestidos).toBe(2);
    expect(p.emProvas).toBe(1);
  });

  it("jornada lista só etapas vivas com noivas, na ordem do acompanhamento", async () => {
    const p = await carregarPainel(loja);
    expect(p.jornada).toEqual([
      { etapa: "NOVO", rotulo: "Nova noiva", total: 3 },
      { etapa: "EM_PROVAS", rotulo: "Em provas", total: 1 },
    ]);
  });

  it("casamentos: conta os de 30 dias e lista os futuros ordenados (passado fora)", async () => {
    const p = await carregarPainel(loja);
    expect(p.casamentosProximos).toBe(2); // 10d e 20d (40d fora da janela)
    expect(p.proximosCasamentos.map((c) => c.diasRestantes)).toEqual([10, 20, 40]);
  });

  it("é escopado por loja: loja sem dados zera tudo", async () => {
    const p = await carregarPainel(outra);
    expect(p).toMatchObject({
      noivasAtivas: 0,
      vestidos: 0,
      emProvas: 0,
      casamentosProximos: 0,
      jornada: [],
      proximosCasamentos: [],
    });
  });
});
