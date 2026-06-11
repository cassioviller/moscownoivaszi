// Integração: detalheDoDia reúne agenda + financeiro de um dia, escopado por loja.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido } from "@/lib/disponibilidade/reservas";
import { agendarAtendimento } from "@/lib/atendimentos/atendimentos";
import { detalheDoDia } from "@/lib/calendario/dia";

const MARK = "t-cal-dia-";
let loja = "";
let vestido = "";
let noiva = "";
let cabine = "";
let vendedora = "";

const ymdHoje = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const base = new Date(`${ymdHoje}T00:00:00.000Z`);
base.setUTCDate(base.getUTCDate() + 30); // dia de teste: +30 (longe de bloqueios)
const dia = base.toISOString().slice(0, 10);

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}Vestido`, precoBase: 1000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva`, etapa: "NOVO" } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vendedora = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: dia });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const p = await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vendedora, dataYMD: dia, hora: 10, tipo: "PROVA", bloqueioId: r.bloqueioId });
  expect(p.ok).toBe(true);
  const a = await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vendedora, dataYMD: dia, hora: 14, tipo: "ATENDIMENTO" });
  expect(a.ok).toBe(true);
  const contrato = await db.contrato.create({
    data: { leadId: noiva, vendedoraId: vendedora, valorTotal: 1000 } as never,
  });
  await db.parcela.create({
    data: { contratoId: contrato.id, numero: 1, valorPrevisto: 500, vencimento: new Date(`${dia}T00:00:00.000Z`) } as never,
  });
  await db.contaPagar.create({
    data: { tipo: "DESPESA", descricao: `${MARK}Lavanderia`, valorPrevisto: 200, vencimento: new Date(`${dia}T00:00:00.000Z`) } as never,
  });
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("detalheDoDia", () => {
  it("reúne provas, atendimentos e casamentos do dia", async () => {
    const d = await detalheDoDia(loja, dia, { financeiro: true });
    expect(d.provas.map((p) => p.inicio.getUTCHours())).toContain(10);
    expect(d.atendimentos.map((a) => a.inicio.getUTCHours())).toContain(14);
    expect(d.casamentos.some((c) => c.noivaNome === `${MARK}Noiva`)).toBe(true);
  });
  it("inclui a receber e a pagar do dia quando financeiro=true", async () => {
    const d = await detalheDoDia(loja, dia, { financeiro: true });
    expect(d.aReceber.some((r) => r.valor === "500.00")).toBe(true);
    expect(d.aPagar.some((c) => c.valor === "200.00")).toBe(true);
  });
  it("omite financeiro quando financeiro=false", async () => {
    const d = await detalheDoDia(loja, dia, { financeiro: false });
    expect(d.aReceber).toEqual([]);
    expect(d.aPagar).toEqual([]);
  });
});
