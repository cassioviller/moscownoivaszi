// src/lib/atelier/__tests__/atelier.test.ts
// Integração (Postgres real): provas e ajustes ligados à reserva, mais a fila
// global de pendentes. Foco: validação do pai, escopo de loja e a fila ordenada.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import { reservarVestido, criarManutencao } from "@/lib/disponibilidade/reservas";
import {
  listarProvasDaReserva,
  listarProvasDaLoja,
  registrarProva,
  editarProva,
  removerProva,
} from "@/lib/atelier/provas";
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

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  lojaOutra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestido = (await db.vestido.create({ data: { codigo: `${MARK}v`, nome: `${MARK}v`, precoBase: 1000 } as never })).id;
  vestidoManut = (await db.vestido.create({ data: { codigo: `${MARK}m`, nome: `${MARK}m`, precoBase: 1000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}Ana`, etapa: "EM_PROVAS" } as never })).id;

  const r = await reservarVestido(loja, { vestidoId: vestido, leadId: noiva, casamentoData: "2026-09-12" });
  if (!r.ok) throw new Error("setup: reserva falhou");
  reservaId = r.bloqueioId;

  const m = await criarManutencao(loja, { vestidoId: vestidoManut, inicio: "2026-10-01", fim: "2026-10-05" });
  if (!m.ok) throw new Error("setup: manutenção falhou");
  manutId = m.id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
});

describe("provas", () => {
  it("registra prova numa reserva e lista com ajustes/checklist vazios", async () => {
    const r = await registrarProva(loja, {
      bloqueioId: reservaId,
      dataReal: "2026-08-20",
      tipo: "PRIMEIRA",
      responsavel: "  Dona Ivete  ",
    });
    expect(r.ok).toBe(true);

    const provas = await listarProvasDaReserva(loja, reservaId);
    expect(provas.length).toBe(1);
    expect(provas[0].tipo).toBe("PRIMEIRA");
    expect(provas[0].comparecimento).toBe("AGENDADA"); // default
    expect(provas[0].responsavel).toBe("Dona Ivete"); // trim
    expect(provas[0].ajustes).toEqual([]);
  });

  it("recusa registrar em manutenção, em bloqueio inexistente e sem data", async () => {
    expect(await registrarProva(loja, { bloqueioId: manutId, dataReal: "2026-08-20", tipo: "PRIMEIRA" }))
      .toMatchObject({ ok: false, motivo: "reserva_invalida" });
    expect(await registrarProva(loja, { bloqueioId: "nao-existe", dataReal: "2026-08-20", tipo: "PRIMEIRA" }))
      .toMatchObject({ ok: false, motivo: "reserva_invalida" });
    expect(await registrarProva(loja, { bloqueioId: reservaId, dataReal: "", tipo: "PRIMEIRA" }))
      .toMatchObject({ ok: false, motivo: "sem_data" });
  });

  it("não enxerga a reserva de outra loja (escopo): registrar falha", async () => {
    const r = await registrarProva(lojaOutra, { bloqueioId: reservaId, dataReal: "2026-08-20", tipo: "FINAL" });
    expect(r).toMatchObject({ ok: false, motivo: "reserva_invalida" });
  });

  it("edita comparecimento e remove prova", async () => {
    const r = await registrarProva(loja, { bloqueioId: reservaId, dataReal: "2026-08-25", tipo: "INTERMEDIARIA" });
    if (!r.ok) throw new Error("prova não criada");
    const e = await editarProva(loja, r.provaId, { comparecimento: "FALTOU", observacao: "remarcar" });
    expect(e.ok).toBe(true);
    let provas = await listarProvasDaReserva(loja, reservaId);
    expect(provas.find((p) => p.id === r.provaId)?.comparecimento).toBe("FALTOU");

    await removerProva(loja, r.provaId);
    provas = await listarProvasDaReserva(loja, reservaId);
    expect(provas.find((p) => p.id === r.provaId)).toBeUndefined();
  });

  it("recusa data malformada e comparecimento inválido (falha fechada, sem 500)", async () => {
    expect(await registrarProva(loja, { bloqueioId: reservaId, dataReal: "2026-13-40", tipo: "PRIMEIRA" }))
      .toMatchObject({ ok: false, motivo: "data_invalida" });
    expect(await registrarProva(loja, { bloqueioId: reservaId, dataReal: "31/12/2026", tipo: "PRIMEIRA" }))
      .toMatchObject({ ok: false, motivo: "data_invalida" });
    expect(await registrarProva(loja, {
      bloqueioId: reservaId, dataReal: "2026-08-20", tipo: "PRIMEIRA",
      comparecimento: "XPTO" as never,
    })).toMatchObject({ ok: false, motivo: "comparecimento_invalido" });
  });

  it("editarProva também valida data e comparecimento", async () => {
    const r = await registrarProva(loja, { bloqueioId: reservaId, dataReal: "2026-08-21", tipo: "PRIMEIRA" });
    if (!r.ok) throw new Error("prova não criada");
    expect(await editarProva(loja, r.provaId, { dataReal: "2026-99-99" }))
      .toMatchObject({ ok: false, motivo: "data_invalida" });
    expect(await editarProva(loja, r.provaId, { comparecimento: "NOPE" as never }))
      .toMatchObject({ ok: false, motivo: "comparecimento_invalido" });
    await removerProva(loja, r.provaId);
  });
});

describe("ajustes + checklist", () => {
  let provaId = "";
  beforeAll(async () => {
    const r = await registrarProva(loja, { bloqueioId: reservaId, dataReal: "2026-08-28", tipo: "PRIMEIRA" });
    if (!r.ok) throw new Error("prova não criada");
    provaId = r.provaId;
  });

  it("adiciona ajuste (pendente), recusa sem descrição e prova de outra loja", async () => {
    const ok = await adicionarAjuste(loja, { provaId, descricao: "  Bainha 3cm  " });
    expect(ok.ok).toBe(true);
    expect(await adicionarAjuste(loja, { provaId, descricao: "   " }))
      .toMatchObject({ ok: false, motivo: "sem_descricao" });
    expect(await adicionarAjuste(lojaOutra, { provaId, descricao: "x" }))
      .toMatchObject({ ok: false, motivo: "prova_invalida" });
  });

  it("alterna status do ajuste e o checklist", async () => {
    const a = await adicionarAjuste(loja, { provaId, descricao: "Ajustar busto" });
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
    const a = await adicionarAjuste(loja, { provaId, descricao: "Costura barra" });
    if (!a.ok) throw new Error("ajuste não criado");
    await adicionarItemChecklist(loja, a.ajusteId, "Item");
    const provas = await listarProvasDaReserva(loja, reservaId);
    const item = provas.flatMap((p) => p.ajustes).find((x) => x.id === a.ajusteId)!.checklist[0];

    const r = await alternarItemChecklist(lojaOutra, item.id); // não deve marcar
    expect(r).toEqual({ ok: false, motivo: "item_invalido" }); // contrato {ok}, não no-op mudo
    const depois = (await listarProvasDaReserva(loja, reservaId))
      .flatMap((p) => p.ajustes).find((x) => x.id === a.ajusteId)!.checklist[0];
    expect(depois.feito).toBe(false);
    // ajuste de outra loja → {ok:false}, mesmo contrato (antes void/sucesso falso)
    expect(await alternarStatusAjuste(lojaOutra, a.ajusteId)).toEqual({ ok: false, motivo: "ajuste_invalido" });
    expect(await removerAjuste(loja, a.ajusteId)).toEqual({ ok: true });
  });
});

describe("fila global de pendentes", () => {
  it("lista só pendentes da loja, com contexto, ordenada por casamento", async () => {
    // limpa provas/ajustes anteriores deste arquivo para isolar a contagem
    await tenantPrisma(prisma, loja).prova.deleteMany({ where: { bloqueioId: reservaId } });

    // duas reservas com casamentos diferentes → checa ordenação por urgência
    const noivaB = (await tenantPrisma(prisma, loja).lead.create({ data: { noivaNome: `${MARK}Bia`, etapa: "EM_PROVAS" } as never })).id;
    const vB = (await tenantPrisma(prisma, loja).vestido.create({ data: { codigo: `${MARK}vb`, nome: `${MARK}vb`, precoBase: 1000 } as never })).id;
    const rB = await reservarVestido(loja, { vestidoId: vB, leadId: noivaB, casamentoData: "2026-07-01" });
    if (!rB.ok) throw new Error("reserva B falhou");

    const pA = await registrarProva(loja, { bloqueioId: reservaId, dataReal: "2026-08-20", tipo: "PRIMEIRA" });
    const pB = await registrarProva(loja, { bloqueioId: rB.bloqueioId, dataReal: "2026-06-01", tipo: "PRIMEIRA" });
    if (!pA.ok || !pB.ok) throw new Error("provas não criadas");

    const aA = await adicionarAjuste(loja, { provaId: pA.provaId, descricao: "ajuste setembro" });
    const aB = await adicionarAjuste(loja, { provaId: pB.provaId, descricao: "ajuste julho" });
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
    expect(pagina1.itens[0].id).toBe(aB.ajusteId); // ordem preservada antes de fatiar
  });

  it("isolamento: a outra loja não vê os pendentes desta", async () => {
    const fila = (await listarAjustesPendentes(lojaOutra)).itens;
    expect(fila.every((f) => f.vestidoCodigo.startsWith(`${MARK}`) === false || f.noivaNome === null)).toBe(true);
    // de forma direta: nenhum ajuste desta loja vaza
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
    provaProx = (await registrarProva(loja, { bloqueioId: reservaId, dataReal: dia(20), tipo: "INTERMEDIARIA" }) as { provaId: string }).provaId;
    provaDistante = (await registrarProva(loja, { bloqueioId: reservaId, dataReal: dia(40), tipo: "FINAL" }) as { provaId: string }).provaId;
    provaPassada = (await registrarProva(loja, { bloqueioId: reservaId, dataReal: dia(-40), tipo: "PRIMEIRA" }) as { provaId: string }).provaId;
  });

  it("próximas: traz as futuras em ordem ascendente, com noiva e vestido", async () => {
    const lista = (await listarProvasDaLoja(loja)).itens;
    const ids = lista.map((p) => p.id);
    expect(ids).toContain(provaProx);
    expect(ids).toContain(provaDistante);
    expect(ids).not.toContain(provaPassada);
    // ascendente: a mais próxima antes da mais distante.
    expect(ids.indexOf(provaProx)).toBeLessThan(ids.indexOf(provaDistante));

    const minha = lista.find((p) => p.id === provaProx)!;
    expect(minha.noivaNome).toBe(`${MARK}Ana`);
    expect(minha.vestidoCodigo).toBe(`${MARK}v`);
    expect(minha.bloqueioId).toBe(reservaId);
  });

  it("paginação: tamanho 1 traz a primeira futura, mas total conta todas", async () => {
    const r = await listarProvasDaLoja(loja, { tamanho: 1 });
    expect(r.itens.length).toBe(1);
    expect(r.total).toBeGreaterThanOrEqual(2); // provaProx + provaDistante
    expect(r.itens[0].id).toBe(provaProx); // a mais próxima (ordem ascendente preservada)
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
