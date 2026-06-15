import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import {
  gradeDoDia,
  agendarAtendimento,
  listarProximosAtendimentos,
  cancelarAtendimento,
  listarAtendimentos,
  iniciarAtendimento,
  concluirAtendimento,
  marcarFalta,
} from "@/lib/atendimentos/atendimentos";
import { fatosDaNoiva } from "@/lib/leads/leads";
import { estagioDaNoiva } from "@/lib/leads/jornada";

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

  it("próximos exclui CONCLUIDO/FALTOU mesmo com data futura (B2)", async () => {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-02-02", hora: 12 });
    if (!r.ok) throw new Error("falhou");
    expect((await listarProximosAtendimentos(loja)).some((a) => a.id === r.atendimentoId)).toBe(true);
    await concluirAtendimento(loja, r.atendimentoId, "RESERVOU");
    // concluído some dos "próximos" (já não é trabalho em aberto), apesar da data futura.
    expect((await listarProximosAtendimentos(loja)).some((a) => a.id === r.atendimentoId)).toBe(false);
    await cancelarAtendimento(loja, r.atendimentoId);
  });
});

describe("atendimentos: ciclo de vida (atender)", () => {
  async function novoAtend(dataYMD: string, hora: number): Promise<string> {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD, hora });
    if (!r.ok) throw new Error(`setup atend falhou: ${r.motivo}`);
    return r.atendimentoId;
  }
  const situacaoDe = async (id: string) =>
    (await tenantPrisma(prisma, loja).atendimento.findUnique({ where: { id }, select: { situacao: true, desfecho: true, atendidoEm: true } }))!;

  it("AGENDADO → EM_ATENDIMENTO carimba atendidoEm; iniciar de novo é inválido", async () => {
    const id = await novoAtend("2099-02-01", 10);
    expect(await iniciarAtendimento(loja, id)).toEqual({ ok: true });
    const at = await situacaoDe(id);
    expect(at.situacao).toBe("EM_ATENDIMENTO");
    expect(at.atendidoEm).not.toBeNull();
    expect(await iniciarAtendimento(loja, id)).toMatchObject({ ok: false, motivo: "transicao_invalida" });
  });

  it("concluir com desfecho; concluir de novo é inválido; desfecho inválido recusado", async () => {
    const id = await novoAtend("2099-02-02", 10);
    await iniciarAtendimento(loja, id);
    expect(await concluirAtendimento(loja, id, "RESERVOU")).toEqual({ ok: true });
    expect((await situacaoDe(id)).desfecho).toBe("RESERVOU");
    expect(await concluirAtendimento(loja, id, "VAI_PENSAR")).toMatchObject({ ok: false, motivo: "transicao_invalida" });

    const id2 = await novoAtend("2099-02-03", 10);
    expect(await concluirAtendimento(loja, id2, "XXX" as never)).toMatchObject({ ok: false, motivo: "desfecho_invalido" });
  });

  it("concluir direto de AGENDADO carimba atendidoEm", async () => {
    const id = await novoAtend("2099-02-04", 10);
    expect(await concluirAtendimento(loja, id, "NAO_SERVIU")).toEqual({ ok: true });
    const at = await situacaoDe(id);
    expect(at.situacao).toBe("CONCLUIDO");
    expect(at.atendidoEm).not.toBeNull();
  });

  it("marcar falta só de AGENDADO; depois não dá pra iniciar", async () => {
    const id = await novoAtend("2099-02-05", 10);
    expect(await marcarFalta(loja, id)).toEqual({ ok: true });
    expect((await situacaoDe(id)).situacao).toBe("FALTOU");
    expect(await iniciarAtendimento(loja, id)).toMatchObject({ ok: false, motivo: "transicao_invalida" });
  });

  it("id inexistente e outra loja → atendimento_invalido", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
    const id = await novoAtend("2099-02-06", 10);
    expect(await iniciarAtendimento(loja, "nao-existe")).toMatchObject({ ok: false, motivo: "atendimento_invalido" });
    expect(await iniciarAtendimento(outra, id)).toMatchObject({ ok: false, motivo: "atendimento_invalido" });
  });

  it("concluir preserva o atendidoEm carimbado no iniciar", async () => {
    const id = await novoAtend("2099-05-01", 10);
    await iniciarAtendimento(loja, id);
    const carimbo = (await situacaoDe(id)).atendidoEm!;
    expect(carimbo).not.toBeNull();
    await concluirAtendimento(loja, id, "VAI_PENSAR");
    expect((await situacaoDe(id)).atendidoEm!.getTime()).toBe(carimbo.getTime());
  });

  it("listarAtendimentos: abertos na fila, finalizados no histórico (por situação)", async () => {
    const aberto = await novoAtend("2099-03-01", 10); // segue AGENDADO
    const fechado = await novoAtend("2099-03-02", 10);
    await concluirAtendimento(loja, fechado, "RESERVOU"); // CONCLUIDO
    const fila = await listarAtendimentos(loja);
    const hist = await listarAtendimentos(loja, { finalizados: true });
    expect(fila.some((a) => a.id === aberto)).toBe(true);
    expect(fila.some((a) => a.id === fechado)).toBe(false);
    expect(hist.some((a) => a.id === fechado)).toBe(true);
    expect(hist.some((a) => a.id === aberto)).toBe(false);
    expect(fila.find((a) => a.id === aberto)!.noivaNome).toBe(`${MARK}Ana`);
  });

  it("agendado VENCIDO continua na fila (não some pela data) — fix do gap", async () => {
    const vencido = await novoAtend("2020-03-01", 10); // AGENDADO no passado
    const fila = await listarAtendimentos(loja);
    expect(fila.some((a) => a.id === vencido)).toBe(true); // acionável, não preso no histórico
  });

  it("jornada: noiva que FALTOU não regride — fica em 'atendimento_agendado'", async () => {
    // lead próprio (o `lead` Ana já tem atendimentos de testes anteriores).
    const bia = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Bia` } as never })).id;
    const r = await agendarAtendimento(loja, { leadId: bia, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-06-01", hora: 10 });
    if (!r.ok) throw new Error("setup falhou");
    await marcarFalta(loja, r.atendimentoId);
    const fatos = (await fatosDaNoiva(loja, bia))!;
    expect(estagioDaNoiva(fatos).atual).toBe("atendimento_agendado");
  });
});

describe("atendimentos: constraint de slot (anti double-booking)", () => {
  const inicio = (ymd: string, h: number) => new Date(`${ymd}T${String(h).padStart(2, "0")}:00:00.000Z`);

  it("constraint de cabine: dois atendimentos na mesma (cabine, inicio) → P2002", async () => {
    const db = tenantPrisma(prisma, loja);
    const data = { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: inicio("2099-08-01", 10) };
    await db.atendimento.create({ data: data as never });
    await expect(db.atendimento.create({ data: data as never })).rejects.toMatchObject({ code: "P2002" });
  });

  it("constraint de vendedora: mesma (vendedora, inicio) em CABINE DIFERENTE → P2002", async () => {
    const db = tenantPrisma(prisma, loja);
    const cabine2 = (await db.cabine.create({ data: { nome: `${MARK}C2` } as never })).id;
    const i = inicio("2099-08-02", 10);
    await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i } as never });
    await expect(
      db.atendimento.create({ data: { leadId: lead, cabineId: cabine2, vendedoraId: vend, inicio: i } as never }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cross-loja: mesma vendedora, mesmo inicio, LOJAS DIFERENTES → ambas inserem", async () => {
    const i = inicio("2099-08-03", 10);
    const db1 = tenantPrisma(prisma, loja);
    await db1.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i } as never });

    const loja2 = (await prisma.loja.create({ data: { nome: `${MARK}loja2` } })).id;
    const db2 = tenantPrisma(prisma, loja2);
    const lead2 = (await db2.lead.create({ data: { noivaNome: `${MARK}Cida` } as never })).id;
    const cabine2 = (await db2.cabine.create({ data: { nome: `${MARK}C-l2` } as never })).id;
    await expect(
      db2.atendimento.create({ data: { leadId: lead2, cabineId: cabine2, vendedoraId: vend, inicio: i } as never }),
    ).resolves.toBeTruthy();
  });

  it("corrida real: dois agendarAtendimento no mesmo slot via Promise.all → um ok, outro indisponivel", async () => {
    const args = { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-08-04", hora: 10 };
    const [a, b] = await Promise.all([agendarAtendimento(loja, args), agendarAtendimento(loja, args)]);
    const oks = [a, b].filter((r) => r.ok).length;
    const indisp = [a, b].filter((r) => !r.ok && r.motivo === "indisponivel").length;
    expect(oks).toBe(1);
    expect(indisp).toBe(1);
  });
});
