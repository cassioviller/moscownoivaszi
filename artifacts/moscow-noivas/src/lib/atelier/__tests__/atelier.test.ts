// src/lib/atelier/__tests__/atelier.test.ts
// Integração (Postgres real): provas (Atendimento{tipo:PROVA}) presas à reserva e
// ajustes ligados à prova, mais a fila global de pendentes. Foco: validação da
// reserva/noiva, ciclo da prova, escopo de loja e a fila ordenada por casamento.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido, criarManutencao } from "@/lib/disponibilidade/reservas";
import {
  agendarAtendimento,
  iniciarAtendimento,
  concluirProva,
  listarProvasAbertas,
} from "@/lib/atendimentos/atendimentos";
import { listarProvasDaReserva, listarProvasDaLoja } from "@/lib/atelier/provas";
import {
  adicionarAjuste,
  alternarStatusAjuste,
  removerAjuste,
  adicionarItemChecklist,
  alternarItemChecklist,
  removerItemChecklist,
  listarAjustesPendentes,
} from "@/lib/atelier/ajustes";

const MARK = "t-atelier-";
let loja = "";
let lojaOutra = "";
let vestido = "";
let vestidoManut = "";
let noiva = "";
let reservaId = "";
let manutId = "";
let cabine = "";
let vend = "";

// Cada prova precisa de um slot livre (cabine OU vendedora). A grade é por DATA, então
// basta dar uma hora distinta por data (9h, 10h, … dentro do funcionamento 9–19).
const horaPorData = new Map<string, number>();
async function agendarProva(bloqueioId: string, leadId: string, dataYMD: string): Promise<string> {
  const hora = horaPorData.get(dataYMD) ?? 9;
  horaPorData.set(dataYMD, hora + 1);
  const r = await agendarAtendimento(loja, { leadId, cabineId: cabine, vendedoraId: vend, dataYMD, hora, tipo: "PROVA", bloqueioId });
  if (!r.ok) throw new Error(`agendar prova falhou: ${r.motivo}`);
  return r.atendimentoId;
}

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  lojaOutra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}v`, precoBase: 1000 } as never })).id;
  vestidoManut = (await db.vestido.create({ data: { codigo: `${MARK}m`, nome: `${MARK}m`, precoBase: 1000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Ana`, etapa: "EM_PROVAS" } as never })).id;
  cabine = (await db.cabine.create({ data: { nome: `${MARK}C1` } as never })).id;
  const u = await prisma.usuario.create({ data: { nome: `${MARK}Vend`, email: `${MARK}${Date.now()}@x.local`, senhaHash: "x" } });
  vend = u.id;
  await prisma.usuarioLoja.create({ data: { usuarioId: u.id, lojaId: loja, perfilId: "perfil-vendedora" } });

  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: "2026-09-12" });
  if (!r.ok) throw new Error("setup: reserva falhou");
  reservaId = r.bloqueioId;

  const m = await criarManutencao(loja, { vestidoId: vestidoManut, inicio: "2026-10-01", fim: "2026-10-05" });
  if (!m.ok) throw new Error("setup: manutenção falhou");
  manutId = m.id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
  await prisma.usuario.deleteMany({ where: { email: { startsWith: MARK } } });
});

describe("agendar prova", () => {
  it("agenda prova numa reserva da própria noiva e lista com ajustes vazios", async () => {
    const id = await agendarProva(reservaId, noiva, "2026-08-20");
    const provas = await listarProvasDaReserva(loja, reservaId);
    const minha = provas.find((p) => p.id === id)!;
    expect(minha).toBeTruthy();
    expect(minha.situacao).toBe("AGENDADO");
    expect(minha.ajustes).toEqual([]);
  });

  it("exige reserva da própria noiva: manutenção, inexistente ou de outra noiva falham", async () => {
    // manutenção não é RESERVA_CASAMENTO
    expect(await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-08-21", hora: 9, tipo: "PROVA", bloqueioId: manutId }))
      .toMatchObject({ ok: false, motivo: "reserva_invalida" });
    // bloqueio inexistente
    expect(await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-08-21", hora: 10, tipo: "PROVA", bloqueioId: "nao-existe" }))
      .toMatchObject({ ok: false, motivo: "reserva_invalida" });
    // sem bloqueio
    expect(await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-08-21", hora: 11, tipo: "PROVA" }))
      .toMatchObject({ ok: false, motivo: "reserva_invalida" });
    // reserva é de outra noiva
    const outraNoiva = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Outra` } as never })).id;
    expect(await agendarAtendimento(loja, { leadId: outraNoiva, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-08-21", hora: 12, tipo: "PROVA", bloqueioId: reservaId }))
      .toMatchObject({ ok: false, motivo: "reserva_nao_e_da_noiva" });
  });

  it("escopo: outra loja não enxerga a reserva → reserva_invalida", async () => {
    // a outra loja não tem cabine/vendedora; mas a reserva sequer é vista por ela
    const cabineO = (await tenantPrisma(prisma, lojaOutra).cabine.create({ data: { nome: `${MARK}CO` } as never })).id;
    const uO = await prisma.usuario.create({ data: { nome: `${MARK}VO`, email: `${MARK}o${Date.now()}@x.local`, senhaHash: "x" } });
    await prisma.usuarioLoja.create({ data: { usuarioId: uO.id, lojaId: lojaOutra, perfilId: "perfil-vendedora" } });
    const leadO = (await tenantPrisma(prisma, lojaOutra).lead.create({ data: { noivaNome: `${MARK}LO` } as never })).id;
    const r = await agendarAtendimento(lojaOutra, { leadId: leadO, cabineId: cabineO, vendedoraId: uO.id, dataYMD: "2026-08-22", hora: 9, tipo: "PROVA", bloqueioId: reservaId });
    expect(r).toMatchObject({ ok: false, motivo: "reserva_invalida" });
  });

  it("ciclo: agendar → iniciar → ajuste → concluir; some das abertas", async () => {
    const id = await agendarProva(reservaId, noiva, "2026-08-23");
    expect((await listarProvasAbertas(loja)).some((p) => p.id === id)).toBe(true);

    expect((await iniciarAtendimento(loja, id)).ok).toBe(true);
    const a = await adicionarAjuste(loja, { atendimentoId: id, descricao: "Bainha 3cm" });
    expect(a.ok).toBe(true);

    const aberta = (await listarProvasAbertas(loja)).find((p) => p.id === id)!;
    expect(aberta.situacao).toBe("EM_ATENDIMENTO");
    expect(aberta.ajustes.length).toBe(1);

    expect((await concluirProva(loja, id)).ok).toBe(true);
    expect((await listarProvasAbertas(loja)).some((p) => p.id === id)).toBe(false);
  });

  it("concluirProva recusa atendimento que não é prova", async () => {
    const r = await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-08-24", hora: 9 });
    if (!r.ok) throw new Error("atendimento não criado");
    expect(await concluirProva(loja, r.atendimentoId)).toMatchObject({ ok: false, motivo: "nao_e_prova" });
  });
});

describe("ajustes + checklist", () => {
  let provaId = "";
  beforeAll(async () => {
    provaId = await agendarProva(reservaId, noiva, "2026-08-28");
  });

  it("adiciona ajuste (pendente), recusa sem descrição e atendimento que não é prova", async () => {
    const ok = await adicionarAjuste(loja, { atendimentoId: provaId, descricao: "  Bainha 3cm  " });
    expect(ok.ok).toBe(true);
    expect(await adicionarAjuste(loja, { atendimentoId: provaId, descricao: "   " }))
      .toMatchObject({ ok: false, motivo: "sem_descricao" });
    // prova de outra loja (não vista) → prova_invalida
    expect(await adicionarAjuste(lojaOutra, { atendimentoId: provaId, descricao: "x" }))
      .toMatchObject({ ok: false, motivo: "prova_invalida" });
    // atendimento comum (tipo ATENDIMENTO) também é recusado
    const at = await agendarAtendimento(loja, { leadId: noiva, cabineId: cabine, vendedoraId: vend, dataYMD: "2026-08-29", hora: 9 });
    if (!at.ok) throw new Error("atendimento não criado");
    expect(await adicionarAjuste(loja, { atendimentoId: at.atendimentoId, descricao: "x" }))
      .toMatchObject({ ok: false, motivo: "prova_invalida" });
  });

  it("alterna status do ajuste e o checklist", async () => {
    const a = await adicionarAjuste(loja, { atendimentoId: provaId, descricao: "Ajustar busto" });
    if (!a.ok) throw new Error("ajuste não criado");

    await adicionarItemChecklist(loja, a.ajusteId, "Marcar alfinetes");
    let provas = await listarProvasDaReserva(loja, reservaId);
    let ajuste = provas.flatMap((p) => p.ajustes).find((x) => x.id === a.ajusteId)!;
    expect(ajuste.status).toBe("PENDENTE");
    expect(ajuste.checklist.length).toBe(1);
    expect(ajuste.checklist[0].feito).toBe(false);

    await alternarItemChecklist(loja, ajuste.checklist[0].id);
    await alternarStatusAjuste(loja, a.ajusteId);
    provas = await listarProvasDaReserva(loja, reservaId);
    ajuste = provas.flatMap((p) => p.ajustes).find((x) => x.id === a.ajusteId)!;
    expect(ajuste.status).toBe("FEITO");
    expect(ajuste.checklist[0].feito).toBe(true);

    // alterna de volta + remove item + remove ajuste
    await alternarStatusAjuste(loja, a.ajusteId);
    await removerItemChecklist(loja, ajuste.checklist[0].id);
    await removerAjuste(loja, a.ajusteId);
    provas = await listarProvasDaReserva(loja, reservaId);
    expect(provas.flatMap((p) => p.ajustes).find((x) => x.id === a.ajusteId)).toBeUndefined();
  });

  it("checklist de outra loja é no-op (falha fechada)", async () => {
    const a = await adicionarAjuste(loja, { atendimentoId: provaId, descricao: "Costura barra" });
    if (!a.ok) throw new Error("ajuste não criado");
    await adicionarItemChecklist(loja, a.ajusteId, "Item");
    const provas = await listarProvasDaReserva(loja, reservaId);
    const item = provas.flatMap((p) => p.ajustes).find((x) => x.id === a.ajusteId)!.checklist[0];

    const r = await alternarItemChecklist(lojaOutra, item.id); // não deve marcar
    expect(r).toEqual({ ok: false, motivo: "item_invalido" });
    const depois = (await listarProvasDaReserva(loja, reservaId))
      .flatMap((p) => p.ajustes).find((x) => x.id === a.ajusteId)!.checklist[0];
    expect(depois.feito).toBe(false);
    expect(await alternarStatusAjuste(lojaOutra, a.ajusteId)).toEqual({ ok: false, motivo: "ajuste_invalido" });
    expect(await removerAjuste(loja, a.ajusteId)).toEqual({ ok: true });
  });
});

describe("fila global de pendentes", () => {
  it("lista só pendentes da loja, com contexto, ordenada por casamento", async () => {
    // limpa provas (e seus ajustes, por cascade) anteriores deste arquivo para isolar a contagem
    await tenantPrisma(prisma, loja).atendimento.deleteMany({ where: { tipo: "PROVA", bloqueioId: reservaId } });

    // duas reservas com casamentos diferentes → checa ordenação por urgência
    const noivaB = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Bia`, etapa: "EM_PROVAS" } as never })).id;
    const vB = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}vb`, nome: `${MARK}vb`, precoBase: 1000 } as never })).id;
    const rB = await reservarVestido(loja, { vestidoId: vB, leadId: noivaB, casamentoData: "2026-07-01" });
    if (!rB.ok) throw new Error("reserva B falhou");

    const pA = await agendarProva(reservaId, noiva, "2026-08-20");
    const pB = await agendarProva(rB.bloqueioId, noivaB, "2026-06-01");

    const aA = await adicionarAjuste(loja, { atendimentoId: pA, descricao: "ajuste setembro" });
    const aB = await adicionarAjuste(loja, { atendimentoId: pB, descricao: "ajuste julho" });
    if (!aA.ok || !aB.ok) throw new Error("ajustes não criados");

    // um ajuste feito não deve aparecer na fila
    await alternarStatusAjuste(loja, aA.ajusteId);

    const fila = (await listarAjustesPendentes(loja)).itens;
    const meus = fila.filter((f) => f.id === aA.ajusteId || f.id === aB.ajusteId);
    expect(meus.map((f) => f.id)).toEqual([aB.ajusteId]); // só o pendente (julho)
    expect(meus[0].noivaNome).toBe(`${MARK}Bia`);
    expect(meus[0].vestidoCodigo).toBe(`${MARK}vb`);

    // marca aA de volta como pendente → agora os dois aparecem, julho antes de setembro
    await alternarStatusAjuste(loja, aA.ajusteId);
    const fila2 = (await listarAjustesPendentes(loja)).itens.filter(
      (f) => f.id === aA.ajusteId || f.id === aB.ajusteId,
    );
    expect(fila2.map((f) => f.id)).toEqual([aB.ajusteId, aA.ajusteId]); // ordenado por casamento

    // paginação: tamanho 1 traz só o primeiro (julho), mas total conta a fila inteira
    const pagina1 = await listarAjustesPendentes(loja, { tamanho: 1 });
    expect(pagina1.itens.length).toBe(1);
    expect(pagina1.total).toBeGreaterThanOrEqual(2);
    expect(pagina1.itens[0].id).toBe(aB.ajusteId);
  });

  it("intervalo: filtra a fila pelo casamento na janela [gte, lt)", async () => {
    const db = tenantPrisma(prisma, loja);
    const noivaC = (await db.lead.create({ data: { noivaNome: `${MARK}Cida`, etapa: "EM_PROVAS" } as never })).id;
    const vC = (await db.vestido.create({ data: { codigo: `${MARK}vc`, nome: `${MARK}vc`, precoBase: 1000 } as never })).id;
    const rC = await reservarVestido(loja, { vestidoId: vC, leadId: noivaC, casamentoData: "2027-03-15" });
    if (!rC.ok) throw new Error("reserva C falhou");
    const pC = await agendarProva(rC.bloqueioId, noivaC, "2027-02-01");
    const aC = await adicionarAjuste(loja, { atendimentoId: pC, descricao: "ajuste março/27" });
    if (!aC.ok) throw new Error("ajuste C falhou");

    const dentro = await listarAjustesPendentes(loja, {
      intervalo: { gte: new Date("2027-03-01T00:00:00.000Z"), lt: new Date("2027-04-01T00:00:00.000Z") },
    });
    expect(dentro.itens.map((f) => f.id)).toContain(aC.ajusteId);

    const fora = await listarAjustesPendentes(loja, {
      intervalo: { gte: new Date("2027-01-01T00:00:00.000Z"), lt: new Date("2027-03-01T00:00:00.000Z") },
    });
    expect(fora.itens.map((f) => f.id)).not.toContain(aC.ajusteId);
  });

  it("isolamento: a outra loja não vê os pendentes desta", async () => {
    const fila = (await listarAjustesPendentes(lojaOutra)).itens;
    expect(fila.length).toBe(0);
  });
});

describe("agenda de provas da loja (listarProvasDaLoja)", () => {
  // Datas relativas ao relógio (robustas no CI): duas futuras (asc) e uma passada.
  const dia = (delta: number) => new Date(Date.now() + delta * 86_400_000).toISOString().slice(0, 10);
  let provaProx = "";
  let provaDistante = "";
  let provaPassada = "";

  beforeAll(async () => {
    provaProx = await agendarProva(reservaId, noiva, dia(20));
    provaDistante = await agendarProva(reservaId, noiva, dia(40));
    provaPassada = await agendarProva(reservaId, noiva, dia(-40));
  });

  it("próximas: traz as futuras em ordem ascendente, com noiva e vestido", async () => {
    const lista = (await listarProvasDaLoja(loja)).itens;
    const ids = lista.map((p) => p.id);
    expect(ids).toContain(provaProx);
    expect(ids).toContain(provaDistante);
    expect(ids).not.toContain(provaPassada);
    expect(ids.indexOf(provaProx)).toBeLessThan(ids.indexOf(provaDistante));

    const minha = lista.find((p) => p.id === provaProx)!;
    expect(minha.noivaNome).toBe(`${MARK}Ana`);
    expect(minha.vestidoCodigo).toBe(`${MARK}v`);
    expect(minha.bloqueioId).toBe(reservaId);
  });

  it("paginação: tamanho 1 traz a primeira futura, mas total conta todas", async () => {
    const r = await listarProvasDaLoja(loja, { tamanho: 1 });
    expect(r.itens.length).toBe(1);
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect(r.itens[0].id).toBe(provaProx);
  });

  it("intervalo: filtra inicio na janela [gte, lt), incluindo dias passados", async () => {
    const gte = new Date(`${dia(-50)}T00:00:00.000Z`);
    const lt = new Date(`${dia(30)}T00:00:00.000Z`);
    const ids = (await listarProvasDaLoja(loja, { intervalo: { gte, lt } })).itens.map((p) => p.id);
    expect(ids).toContain(provaPassada);
    expect(ids).toContain(provaProx);
    expect(ids).not.toContain(provaDistante);
    expect(ids.indexOf(provaPassada)).toBeLessThan(ids.indexOf(provaProx));
  });

  it("passadas: traz só o histórico (descendente) e exclui as futuras", async () => {
    const lista = (await listarProvasDaLoja(loja, { passadas: true })).itens;
    const ids = lista.map((p) => p.id);
    expect(ids).toContain(provaPassada);
    expect(ids).not.toContain(provaProx);
    expect(ids).not.toContain(provaDistante);
  });

  it("isolamento: a outra loja não vê as provas desta", async () => {
    const r = await listarProvasDaLoja(lojaOutra);
    expect(r.itens.length).toBe(0);
    expect(r.total).toBe(0);
  });
});
