// Integração: atendimentos entram no calendário (lista por intervalo + marcador).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { agendarAtendimento } from "@/lib/atendimentos/atendimentos";
import { atendimentosNoIntervalo, marcadoresNoIntervalo } from "@/lib/calendario/dados";

const MARK = "t-cal-atend-";
let loja = "", lead = "", cabine = "", vend = "", atendId = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Noiva` } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
  const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 14 });
  if (!r.ok) throw new Error(`setup atendimento falhou: ${r.motivo}`);
  atendId = r.atendimentoId;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("calendário ← atendimentos", () => {
  it("atendimentosNoIntervalo inclui o que cai no dia e exclui fora", async () => {
    const dentro = await atendimentosNoIntervalo(loja, dia("2026-09-12"), dia("2026-09-13"));
    expect(dentro.some((a) => a.id === atendId)).toBe(true);
    const fora = await atendimentosNoIntervalo(loja, dia("2026-09-13"), dia("2026-09-14"));
    expect(fora.some((a) => a.id === atendId)).toBe(false);
  });
  it("marcadoresNoIntervalo traz um marcador tipo 'atendimento' no dia 2026-09-12", async () => {
    const marc = await marcadoresNoIntervalo(loja, dia("2026-09-12"), dia("2026-09-13"));
    expect(marc.some((m) => m.ymd === "2026-09-12" && m.tipo === "atendimento")).toBe(true);
  });

  it("atendimentosNoIntervalo filtra por vendedoraId (F2); sem filtro traz todos", async () => {
    const u2 = await prisma.usuario.create({ data: { nome: `${MARK}Vend2`, email: `${MARK}v2-${Date.now()}@x.local`, senhaHash: "x" } });
    await prisma.usuarioLoja.create({ data: { usuarioId: u2.id, lojaId: loja, perfilId: "perfil-vendedora" } });
    // outro atendimento no mesmo dia, vendedora u2 (cabine livre às 15h)
    const r2 = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: u2.id, dataYMD: "2026-09-12", hora: 15 });
    if (!r2.ok) throw new Error(`setup falhou: ${r2.motivo}`);
    const desde = dia("2026-09-12"), ate = dia("2026-09-13");
    const soU2 = await atendimentosNoIntervalo(loja, desde, ate, { vendedoraId: u2.id });
    expect(soU2.map((a) => a.id)).toContain(r2.atendimentoId);
    expect(soU2.map((a) => a.id)).not.toContain(atendId);
    const todos = await atendimentosNoIntervalo(loja, desde, ate);
    expect(todos.map((a) => a.id)).toEqual(expect.arrayContaining([atendId, r2.atendimentoId]));
  });
});
