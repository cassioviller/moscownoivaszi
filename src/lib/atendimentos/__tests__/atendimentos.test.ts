import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { gradeDoDia, agendarAtendimento, listarProximosAtendimentos, cancelarAtendimento } from "@/lib/atendimentos/atendimentos";

const MARK = "t-atend-";
let loja = "", lead = "", cabine = "", vend = "";
beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  lead = (await db.lead.create({ data: { noivaNome: `${MARK}Ana` } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });
});
afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("atendimentos", () => {
  it("agenda quando livre; grade reflete; recusa hora ocupada (cabine) e fora do horário", async () => {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 14, observacao: " teste " });
    expect(r.ok).toBe(true);

    const grade = await gradeDoDia(loja, { dataYMD: "2026-09-12", cabineId: cabine, vendedoraId: vend });
    expect(grade.find((s) => s.hora === 14)!.livre).toBe(false);
    expect(grade.find((s) => s.hora === 15)!.livre).toBe(true);

    // mesma cabine, mesma hora → indisponível (mesmo com outra vendedora não testada aqui)
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 14 }))
      .toMatchObject({ ok: false, motivo: "indisponivel" });
    // fora do horário (default 9–19): 20h
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-12", hora: 20 }))
      .toMatchObject({ ok: false, motivo: "fora_funcionamento" });
  });

  it("recusa cabine/vendedora/lead inválidos da loja", async () => {
    expect(await agendarAtendimento(loja, { leadId: "x", cabineId: cabine, vendedoraId: vend, dataYMD: "2026-09-13", hora: 10 })).toMatchObject({ ok: false, motivo: "lead_invalido" });
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: "x", vendedoraId: vend, dataYMD: "2026-09-13", hora: 10 })).toMatchObject({ ok: false, motivo: "cabine_invalida" });
    expect(await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: "x", dataYMD: "2026-09-13", hora: 10 })).toMatchObject({ ok: false, motivo: "vendedora_invalida" });
  });

  it("lista próximos e cancela", async () => {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-01-01", hora: 11 });
    if (!r.ok) throw new Error("falhou");
    const prox = await listarProximosAtendimentos(loja);
    expect(prox.some((a) => a.id === r.atendimentoId)).toBe(true);
    await cancelarAtendimento(loja, r.atendimentoId);
    const prox2 = await listarProximosAtendimentos(loja);
    expect(prox2.some((a) => a.id === r.atendimentoId)).toBe(false);
  });
});
