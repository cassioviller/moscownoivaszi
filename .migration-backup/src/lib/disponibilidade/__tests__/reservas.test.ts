// src/lib/disponibilidade/__tests__/reservas.test.ts
// Integração (Postgres real): o data-layer de reserva ligando o motor ao banco.
// Foco: conflito é barrado, cancelar libera, vestidosLivresPara reflete o estado.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import {
  reservarVestido,
  removerBloqueio,
  listarReservasDoVestido,
  listarVestidosReservadosDaNoiva,
  vestidosLivresPara,
  criarManutencao,
  listarManutencoesDoVestido,
  listarReservasDaLoja,
  definirMovimentacaoReserva,
  obterReservaDetalhe,
} from "@/lib/disponibilidade/reservas";

const MARK = "t-reservas-";
let loja = "";
let vestidoA = "";
let vestidoB = "";
let noiva = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  const db = tenantPrisma(prisma, loja);
  vestidoA = (await db.vestido.create({ data: { codigo: `${MARK}A`, nome: `${MARK}A`, precoBase: 1000 } as never })).id;
  vestidoB = (await db.vestido.create({ data: { codigo: `${MARK}B`, nome: `${MARK}B`, precoBase: 2000 } as never })).id;
  noiva = (await db.lead.create({ data: { noivaNome: `${MARK}n`, etapa: "NOVO" } as never })).id;
});

afterAll(async () => {
  // Cascade a partir da loja apaga vestidos, leads e bloqueios marcados.
  await prisma.loja.deleteMany({ where: { nome: { startsWith: MARK } } });
});

describe("reservas: motor ligado ao banco", () => {
  it("reserva quando livre e barra conflito na mesma janela", async () => {
    const ok = await reservarVestido(loja, {
      vestidoId: vestidoA,
      leadId: noiva,
      casamentoData: "2026-09-12",
    });
    expect(ok.ok).toBe(true);

    // Mesma peça, data colada (uso/prova se sobrepõem) → recusa.
    const conflito = await reservarVestido(loja, {
      vestidoId: vestidoA,
      leadId: noiva,
      casamentoData: "2026-09-13",
    });
    expect(conflito.ok).toBe(false);
    if (!conflito.ok) {
      expect(conflito.motivo).toBe("indisponivel");
      expect(conflito.conflitos?.length).toBeGreaterThan(0);
    }
  });

  it("recusa data vazia e vestido/noiva de fora da loja", async () => {
    expect((await reservarVestido(loja, { vestidoId: vestidoA, leadId: noiva, casamentoData: "" })).ok).toBe(false);
    const semVestido = await reservarVestido(loja, { vestidoId: "nao-existe", leadId: noiva, casamentoData: "2027-01-01" });
    expect(semVestido).toMatchObject({ ok: false, motivo: "vestido_invalido" });
    const semLead = await reservarVestido(loja, { vestidoId: vestidoB, leadId: "nao-existe", casamentoData: "2027-01-01" });
    expect(semLead).toMatchObject({ ok: false, motivo: "lead_invalido" });
  });

  it("cancelar libera a peça para a mesma data", async () => {
    const r = await reservarVestido(loja, { vestidoId: vestidoB, leadId: noiva, casamentoData: "2026-12-05" });
    expect(r.ok).toBe(true);

    // Antes de cancelar: não está livre nessa data.
    const livresAntes = await vestidosLivresPara(loja, "2026-12-05");
    expect(livresAntes.some((v) => v.id === vestidoB)).toBe(false);

    if (r.ok) await removerBloqueio(loja, r.bloqueioId);

    const livresDepois = await vestidosLivresPara(loja, "2026-12-05");
    expect(livresDepois.some((v) => v.id === vestidoB)).toBe(true);
  });

  it("lista reservas pelo vestido e pela noiva", async () => {
    const doVestido = await listarReservasDoVestido(loja, vestidoA);
    expect(doVestido.length).toBeGreaterThan(0);
    expect(doVestido[0].noivaNome).toBe(`${MARK}n`);

    const daNoiva = await listarVestidosReservadosDaNoiva(loja, noiva);
    expect(daNoiva.some((r) => r.vestidoId === vestidoA)).toBe(true);
  });

  it("grava reservaId no bloqueio quando passado", async () => {
    const reserva = await tenantPrisma(prisma, loja).reserva.create({
      data: { leadId: noiva, casamentoData: new Date("2028-03-10T00:00:00.000Z"), status: "EM_MONTAGEM" } as never,
    });
    const r = await reservarVestido(loja, { vestidoId: vestidoA, leadId: noiva, casamentoData: "2028-03-10", reservaId: reserva.id });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = await tenantPrisma(prisma, loja).bloqueioVestido.findUnique({ where: { id: r.bloqueioId } });
      expect(row?.reservaId).toBe(reserva.id);
    }
  });

  it("manutenção bloqueia reserva no período e cancelar libera", async () => {
    const m = await criarManutencao(loja, {
      vestidoId: vestidoB,
      inicio: "2027-03-01",
      fim: "2027-03-31",
    });
    expect(m.ok).toBe(true);

    expect(await listarManutencoesDoVestido(loja, vestidoB)).toHaveLength(1);

    // Casamento dentro da janela de manutenção → indisponível.
    const bloqueada = await reservarVestido(loja, {
      vestidoId: vestidoB,
      leadId: noiva,
      casamentoData: "2027-03-15",
    });
    expect(bloqueada.ok).toBe(false);

    // Cancela a manutenção → volta a ficar livre.
    if (m.ok) await removerBloqueio(loja, m.id);
    const livre = await reservarVestido(loja, {
      vestidoId: vestidoB,
      leadId: noiva,
      casamentoData: "2027-03-15",
    });
    expect(livre.ok).toBe(true);
    if (livre.ok) await removerBloqueio(loja, livre.bloqueioId); // limpa p/ não vazar
  });

  it("recusa manutenção com datas invertidas", async () => {
    const r = await criarManutencao(loja, { vestidoId: vestidoB, inicio: "2027-05-10", fim: "2027-05-01" });
    expect(r).toMatchObject({ ok: false, motivo: "datas_invertidas" });
  });

  it("livro de reservas da loja traz as futuras com noiva e vestido", async () => {
    // Data claramente futura (independe do relógio do CI).
    const futuro = new Date(Date.now() + 150 * 86_400_000).toISOString().slice(0, 10);
    const r = await reservarVestido(loja, { vestidoId: vestidoB, leadId: noiva, casamentoData: futuro });
    expect(r.ok).toBe(true);

    const livro = await listarReservasDaLoja(loja);
    const minha = livro.find((x) => x.vestidoId === vestidoB && x.codigo === `${MARK}B`);
    expect(minha).toBeDefined();
    expect(minha?.noivaNome).toBe(`${MARK}n`);
    // Só futuras: nenhuma com casamento antes de hoje.
    const hoje = new Date(new Date().toISOString().slice(0, 10));
    expect(livro.every((x) => x.casamentoData && x.casamentoData >= hoje)).toBe(true);

    if (r.ok) await removerBloqueio(loja, r.bloqueioId);
  });
});

describe("movimentação da reserva (retirada/devolução)", () => {
  // Vestido + reserva dedicados (casamento 2026-09-12 → preparação começa 2026-08-29).
  let vestidoM = "";
  let reservaM = "";
  let seq = 0;

  // Cada teste que cria reserva ganha seu PRÓPRIO vestido: registrar retirada sem
  // devolução deixa o uso em aberto e bloquearia o vestido para qualquer outra data.
  async function novaReservaIsolada(casamento: string): Promise<string> {
    const db = tenantPrisma(prisma, loja);
    seq += 1;
    const vid = (
      await db.vestido.create({ data: { codigo: `${MARK}M${seq}`, nome: `${MARK}M${seq}`, precoBase: 1500 } as never })
    ).id;
    const r = await reservarVestido(loja, { vestidoId: vid, leadId: noiva, casamentoData: casamento });
    if (!r.ok) throw new Error("setup: nova reserva isolada falhou");
    return r.bloqueioId;
  }

  beforeAll(async () => {
    const db = tenantPrisma(prisma, loja);
    vestidoM = (await db.vestido.create({ data: { codigo: `${MARK}M`, nome: `${MARK}M`, precoBase: 1500 } as never })).id;
    const r = await reservarVestido(loja, { vestidoId: vestidoM, leadId: noiva, casamentoData: "2026-09-12" });
    if (!r.ok) throw new Error("setup: reserva falhou");
    reservaM = r.bloqueioId;
  });

  it("registra retirada e deixa o uso em aberto (peça fora)", async () => {
    const r = await definirMovimentacaoReserva(loja, reservaM, { retiradaDataReal: "2026-09-10" });
    expect(r).toEqual({ ok: true });

    const det = await obterReservaDetalhe(loja, reservaM);
    const ultima = det!.fases[det!.fases.length - 1];
    expect(ultima.tipo).toBe("uso");
    expect(ultima.abertoFim).toBe(true); // retirou e não devolveu → indeterminado
  });

  it("registra devolução: uso fecha e a lavagem aparece", async () => {
    const r = await definirMovimentacaoReserva(loja, reservaM, { devolucaoDataReal: "2026-09-14" });
    expect(r).toEqual({ ok: true });

    const det = await obterReservaDetalhe(loja, reservaM);
    expect(det!.fases.some((f) => f.tipo === "lavagem")).toBe(true);
    expect(det!.fases.every((f) => !f.abertoFim)).toBe(true);
  });

  it("limpar a devolução sozinha é permitido (reabre o uso)", async () => {
    const r = await definirMovimentacaoReserva(loja, reservaM, { devolucaoDataReal: null });
    expect(r).toEqual({ ok: true });
    const det = await obterReservaDetalhe(loja, reservaM);
    expect(det!.fases[det!.fases.length - 1].abertoFim).toBe(true);
  });

  it("limpar a retirada com devolução setada é recusado (devolucao_orfa)", async () => {
    // Reserva nova (vestido próprio), retirada + devolução cheias.
    const id = await novaReservaIsolada("2027-06-20");
    await definirMovimentacaoReserva(loja, id, { retiradaDataReal: "2027-06-18" });
    await definirMovimentacaoReserva(loja, id, { devolucaoDataReal: "2027-06-22" });

    const r = await definirMovimentacaoReserva(loja, id, { retiradaDataReal: null });
    expect(r).toMatchObject({ ok: false, motivo: "devolucao_orfa" });
  });

  it("recusa devolução sem retirada (sem_retirada)", async () => {
    const id = await novaReservaIsolada("2027-07-20");
    const r = await definirMovimentacaoReserva(loja, id, { devolucaoDataReal: "2027-07-18" });
    expect(r).toMatchObject({ ok: false, motivo: "sem_retirada" });
  });

  it("recusa devolução anterior à retirada (data_invertida)", async () => {
    const id = await novaReservaIsolada("2027-08-20");
    await definirMovimentacaoReserva(loja, id, { retiradaDataReal: "2027-08-18" });
    const r = await definirMovimentacaoReserva(loja, id, { devolucaoDataReal: "2027-08-15" });
    expect(r).toMatchObject({ ok: false, motivo: "data_invertida" });
  });

  it("recusa dia mal formado (data_invalida)", async () => {
    const r = await definirMovimentacaoReserva(loja, reservaM, { retiradaDataReal: "2026-13-40" });
    expect(r).toMatchObject({ ok: false, motivo: "data_invalida" });
  });

  it("string vazia é inválida e NÃO apaga a retirada (não confunde com limpar)", async () => {
    const id = await novaReservaIsolada("2027-09-20");
    await definirMovimentacaoReserva(loja, id, { retiradaDataReal: "2027-09-18" });
    const r = await definirMovimentacaoReserva(loja, id, { retiradaDataReal: "" });
    expect(r).toMatchObject({ ok: false, motivo: "data_invalida" });
    const det = await obterReservaDetalhe(loja, id);
    expect(det!.retiradaDataReal).not.toBeNull(); // continua retirado
  });

  it("aceita retirada e devolução no MESMO patch (ordenadas)", async () => {
    const id = await novaReservaIsolada("2027-10-20");
    const r = await definirMovimentacaoReserva(loja, id, {
      retiradaDataReal: "2027-10-18",
      devolucaoDataReal: "2027-10-22",
    });
    expect(r).toEqual({ ok: true });
    const det = await obterReservaDetalhe(loja, id);
    expect(det!.fases.some((f) => f.tipo === "lavagem")).toBe(true);
  });

  it("recusa retirada e devolução invertidas no MESMO patch (data_invertida)", async () => {
    const id = await novaReservaIsolada("2027-11-20");
    const r = await definirMovimentacaoReserva(loja, id, {
      retiradaDataReal: "2027-11-18",
      devolucaoDataReal: "2027-11-15",
    });
    expect(r).toMatchObject({ ok: false, motivo: "data_invertida" });
  });

  it("limpar retirada e devolução juntas volta ao estado inicial", async () => {
    const id = await novaReservaIsolada("2027-12-20");
    await definirMovimentacaoReserva(loja, id, { retiradaDataReal: "2027-12-18", devolucaoDataReal: "2027-12-22" });
    const r = await definirMovimentacaoReserva(loja, id, { retiradaDataReal: null, devolucaoDataReal: null });
    expect(r).toEqual({ ok: true });
    const det = await obterReservaDetalhe(loja, id);
    expect(det!.retiradaDataReal).toBeNull();
    expect(det!.devolucaoDataReal).toBeNull();
  });

  it("recusa retirada cedo demais que inverteria a preparação (datas_invalidas)", async () => {
    // Preparação começa 14 dias antes (2026-08-29); retirar em 2026-08-01 inverte a janela.
    const r = await definirMovimentacaoReserva(loja, reservaM, { retiradaDataReal: "2026-08-01" });
    expect(r).toMatchObject({ ok: false, motivo: "datas_invalidas" });
  });

  it("recusa bloqueio de manutenção (reserva_invalida)", async () => {
    const m = await criarManutencao(loja, { vestidoId: vestidoM, inicio: "2028-01-10", fim: "2028-01-20" });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const r = await definirMovimentacaoReserva(loja, m.id, { retiradaDataReal: "2028-01-12" });
    expect(r).toMatchObject({ ok: false, motivo: "reserva_invalida" });
    await removerBloqueio(loja, m.id);
  });

  it("isolamento: outra loja não move a reserva", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}loja2` } })).id;
    const r = await definirMovimentacaoReserva(outra, reservaM, { retiradaDataReal: "2026-09-09" });
    expect(r).toMatchObject({ ok: false, motivo: "reserva_invalida" });
  });
});
