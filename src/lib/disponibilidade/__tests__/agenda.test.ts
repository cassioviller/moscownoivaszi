// src/lib/disponibilidade/__tests__/agenda.test.ts
// Integração: a agenda deriva compromissos das reservas via o motor.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import { agendaDoAtelier } from "@/lib/disponibilidade/agenda";

const MARK = "t-agenda-";
let loja = "";
let vestido = "";
let noiva = "";

// Casamento ~30 dias à frente do dia-calendário em SP (cai dentro do horizonte).
const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const casamento = new Date(`${ymd}T00:00:00.000Z`);
casamento.setUTCDate(casamento.getUTCDate() + 30);
const casamentoDia = casamento.toISOString().slice(0, 10);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}Vestido`, precoBase: 1000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: casamentoDia });
  expect(r.ok).toBe(true);
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
});

describe("agendaDoAtelier", () => {
  it("projeta prova, uso e higienização da reserva, com vestido e noiva", async () => {
    const eventos = await agendaDoAtelier(loja);
    const meus = eventos.filter((e) => e.vestidoId === vestido);

    const tipos = meus.map((e) => e.tipo);
    expect(tipos).toContain("prova");
    expect(tipos).toContain("uso");
    expect(tipos).toContain("lavagem");

    expect(meus[0].noivaNome).toBe(`${MARK}Noiva`);
    expect(meus[0].vestidoCodigo).toBe(`${MARK}v`);
    // Ordenado por início: prova vem antes do uso.
    expect(meus[0].inicio.getTime()).toBeLessThanOrEqual(meus[meus.length - 1].inicio.getTime());
  });

  it("ignora reservas fora do horizonte", async () => {
    const eventos = await agendaDoAtelier(loja, 5); // casamento está ~30d → fora
    expect(eventos.some((e) => e.vestidoId === vestido)).toBe(false);
  });
});
