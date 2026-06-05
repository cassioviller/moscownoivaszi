// Integração: marcadores do calendário derivam das reservas e provas da loja.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import { registrarProva } from "@/lib/atelier/provas";
import { marcadoresNoIntervalo } from "@/lib/calendario/dados";

const MARK = "t-cal-dados-";
let loja = "";
let vestido = "";
let noiva = "";

// Casamento ~20 dias à frente do dia-calendário em SP.
const ymdHoje = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const casamento = new Date(`${ymdHoje}T00:00:00.000Z`);
casamento.setUTCDate(casamento.getUTCDate() + 20);
const casamentoDia = casamento.toISOString().slice(0, 10);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}Vestido`, precoBase: 1000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: casamentoDia });
  expect(r.ok).toBe(true);
  if (r.ok) {
    const p = await registrarProva(loja, { bloqueioId: r.bloqueioId, dataReal: casamentoDia, tipo: "PRIMEIRA" });
    expect(p.ok).toBe(true);
  }
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
});

describe("marcadoresNoIntervalo", () => {
  it("inclui casamento e prova que caem no intervalo", async () => {
    const inicio = new Date(`${ymdHoje}T00:00:00.000Z`);
    const fim = new Date(casamento.getTime());
    fim.setUTCDate(fim.getUTCDate() + 1); // intervalo [hoje, casamento+1)
    const marcadores = await marcadoresNoIntervalo(loja, inicio, fim);
    const tipos = marcadores.filter((m) => m.ymd === casamentoDia).map((m) => m.tipo);
    expect(tipos).toContain("casamento");
    expect(tipos).toContain("prova");
  });
  it("não inclui nada fora do intervalo", async () => {
    const inicio = new Date(`${ymdHoje}T00:00:00.000Z`);
    const fim = new Date(`${ymdHoje}T00:00:00.000Z`);
    fim.setUTCDate(fim.getUTCDate() + 1); // só hoje
    const marcadores = await marcadoresNoIntervalo(loja, inicio, fim);
    expect(marcadores.some((m) => m.ymd === casamentoDia)).toBe(false);
  });
});
