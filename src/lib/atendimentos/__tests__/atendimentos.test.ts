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
  reabrirAtendimento,
  buscarAtendimentos,
  SITUACOES_FECHADAS,
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

describe("listarAtendimentos — filtros (F2)", () => {
  it("situacao estreita o grupo aberto; noivaBusca filtra no histórico", async () => {
    const db = tenantPrisma(prisma, loja);
    const dora = (await db.lead.create({ data: { noivaNome: `${MARK}Dora Lima` } as never })).id;
    const r = await agendarAtendimento(loja, { leadId: dora, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-12-01", hora: 9 });
    if (!r.ok) throw new Error("setup falhou");
    const r2 = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD: "2099-12-01", hora: 10 });
    if (!r2.ok) throw new Error("setup falhou");
    await iniciarAtendimento(loja, r2.atendimentoId);

    const soAgendados = await listarAtendimentos(loja, { situacao: "AGENDADO" });
    expect(soAgendados.some((a) => a.id === r.atendimentoId)).toBe(true);
    expect(soAgendados.some((a) => a.id === r2.atendimentoId)).toBe(false);

    await concluirAtendimento(loja, r.atendimentoId, "RESERVOU");
    const hist = await listarAtendimentos(loja, { finalizados: true, noivaBusca: "dora" });
    expect(hist.some((a) => a.id === r.atendimentoId)).toBe(true);
    expect(hist.every((a) => (a.noivaNome ?? "").toLowerCase().includes("dora"))).toBe(true);
  });
});

describe("reabrirAtendimento (M2 — desfazer)", () => {
  async function novo(dataYMD: string, hora: number): Promise<string> {
    const r = await agendarAtendimento(loja, { leadId: lead, cabineId: cabine, vendedoraId: vend, dataYMD, hora });
    if (!r.ok) throw new Error(`setup falhou: ${r.motivo}`);
    return r.atendimentoId;
  }
  const sit = async (id: string) =>
    (await tenantPrisma(prisma, loja).atendimento.findUnique({ where: { id }, select: { situacao: true, desfecho: true, atendidoEm: true } }))!;

  it("EM_ATENDIMENTO → AGENDADO, atendidoEm nulo", async () => {
    const id = await novo("2099-04-01", 9);
    await iniciarAtendimento(loja, id);
    expect(await reabrirAtendimento(loja, id)).toEqual({ ok: true });
    const a = await sit(id);
    expect(a.situacao).toBe("AGENDADO");
    expect(a.atendidoEm).toBeNull();
  });

  it("CONCLUIDO (com desfecho) → AGENDADO, desfecho e atendidoEm nulos", async () => {
    const id = await novo("2099-04-02", 9);
    await concluirAtendimento(loja, id, "RESERVOU");
    expect(await reabrirAtendimento(loja, id)).toEqual({ ok: true });
    const a = await sit(id);
    expect(a.situacao).toBe("AGENDADO");
    expect(a.desfecho).toBeNull();
    expect(a.atendidoEm).toBeNull();
  });

  it("FALTOU → AGENDADO", async () => {
    const id = await novo("2099-04-03", 9);
    await marcarFalta(loja, id);
    expect(await reabrirAtendimento(loja, id)).toEqual({ ok: true });
    expect((await sit(id)).situacao).toBe("AGENDADO");
  });

  it("AGENDADO → transicao_invalida (já está aberto)", async () => {
    const id = await novo("2099-04-04", 9);
    expect(await reabrirAtendimento(loja, id)).toMatchObject({ ok: false, motivo: "transicao_invalida" });
  });

  it("id inexistente e outra loja → atendimento_invalido", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}reabrir-outra` } })).id;
    const id = await novo("2099-04-05", 9);
    expect(await reabrirAtendimento(loja, "nao-existe")).toMatchObject({ ok: false, motivo: "atendimento_invalido" });
    expect(await reabrirAtendimento(outra, id)).toMatchObject({ ok: false, motivo: "atendimento_invalido" });
  });
});

describe("buscarAtendimentos (núcleo parametrizado)", () => {
  it("filtra por tipo, situação e intervalo [desde, ate); respeita a ordem", async () => {
    const db = tenantPrisma(prisma, loja);
    const i = (ymd: string, h: number) => new Date(`${ymd}T${String(h).padStart(2, "0")}:00:00.000Z`);
    const a1 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i("2099-10-01", 9), tipo: "ATENDIMENTO", situacao: "CONCLUIDO", desfecho: "RESERVOU" } as never });
    const a2 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i("2099-10-01", 10), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const vx = await db.vestido.create({ data: { codigo: "BX1", nome: `${MARK}vx`, precoBase: "1.00" } as never });
    const bloqueio = await db.bloqueioVestido.create({ data: { vestidoId: vx.id, leadId: lead, tipo: "RESERVA_CASAMENTO" } as never });
    await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i("2099-10-01", 11), tipo: "PROVA", bloqueioId: bloqueio.id, situacao: "AGENDADO" } as never });

    const desde = i("2099-10-01", 0), ate = i("2099-10-02", 0);

    // tipo=ATENDIMENTO no intervalo → só a1 e a2 (PROVA fora)
    const todos = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate });
    const ids = todos.map((r) => r.id);
    expect(ids).toContain(a1.id);
    expect(ids).toContain(a2.id);
    expect(todos.every((r) => r.tipo === "ATENDIMENTO")).toBe(true);

    // situacoes=FECHADAS → só a1 (CONCLUIDO)
    const fechados = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate, situacoes: SITUACOES_FECHADAS });
    expect(fechados.map((r) => r.id)).toEqual([a1.id]);
    expect(fechados[0].desfecho).toBe("RESERVOU");
    expect(fechados[0].cabineNome).toBe(`${MARK}C1`);

    // ordem desc → a2 (10h) antes de a1 (9h)
    const desc = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate, ordem: "desc" });
    const idxA1 = desc.findIndex((r) => r.id === a1.id);
    const idxA2 = desc.findIndex((r) => r.id === a2.id);
    expect(idxA2).toBeLessThan(idxA1);

    // intervalo meio-aberto: ate exclusivo
    const aBorda = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: ate, tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const dentro = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde, ate });
    expect(dentro.map((r) => r.id)).not.toContain(aBorda.id);
  });

  it("filtra por vendedoraId", async () => {
    const db = tenantPrisma(prisma, loja);
    const i = (h: number) => new Date(`2099-11-01T${String(h).padStart(2, "0")}:00:00.000Z`);
    const u2 = await prisma.usuario.create({ data: { nome: `${MARK}Vend2`, email: `${MARK}v2-${Date.now()}@x.local`, senhaHash: "x" } });
    await prisma.usuarioLoja.create({ data: { usuarioId: u2.id, lojaId: loja, perfilId: "perfil-vendedora" } });
    const a1 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: vend, inicio: i(9), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const a2 = await db.atendimento.create({ data: { leadId: lead, cabineId: cabine, vendedoraId: u2.id, inicio: i(10), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const so2 = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), vendedoraId: u2.id });
    expect(so2.map((r) => r.id)).toContain(a2.id);
    expect(so2.map((r) => r.id)).not.toContain(a1.id);
  });

  it("filtra por noivaBusca (contains, case-insensitive)", async () => {
    const db = tenantPrisma(prisma, loja);
    const i = (h: number) => new Date(`2099-11-02T${String(h).padStart(2, "0")}:00:00.000Z`);
    const marina = (await db.lead.create({ data: { noivaNome: `${MARK}Marina Silva` } as never })).id;
    const a = await db.atendimento.create({ data: { leadId: marina, cabineId: cabine, vendedoraId: vend, inicio: i(9), tipo: "ATENDIMENTO", situacao: "AGENDADO" } as never });
    const porMin = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), noivaBusca: "marina" });
    expect(porMin.map((r) => r.id)).toContain(a.id);
    const porMaiusc = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), noivaBusca: "MARINA" });
    expect(porMaiusc.map((r) => r.id)).toContain(a.id);
    const semMatch = await buscarAtendimentos(loja, { tipo: "ATENDIMENTO", desde: i(0), ate: i(23), noivaBusca: "zzzznao" });
    expect(semMatch.map((r) => r.id)).not.toContain(a.id);
  });
});
