// src/lib/disponibilidade/__tests__/reservas.test.ts
// Integração (Postgres real): o data-layer de reserva ligando o motor ao banco.
// Foco: conflito é barrado, cancelar libera, vestidosLivresPara reflete o estado.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { tenantPrisma } from "@/lib/tenant";
import {
  reservarVestido,
  cancelarReserva,
  listarReservasDoVestido,
  listarReservasDaNoiva,
  vestidosLivresPara,
  criarManutencao,
  listarManutencoesDoVestido,
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

    if (r.ok) await cancelarReserva(loja, r.bloqueioId);

    const livresDepois = await vestidosLivresPara(loja, "2026-12-05");
    expect(livresDepois.some((v) => v.id === vestidoB)).toBe(true);
  });

  it("lista reservas pelo vestido e pela noiva", async () => {
    const doVestido = await listarReservasDoVestido(loja, vestidoA);
    expect(doVestido.length).toBeGreaterThan(0);
    expect(doVestido[0].noivaNome).toBe(`${MARK}n`);

    const daNoiva = await listarReservasDaNoiva(loja, noiva);
    expect(daNoiva.some((r) => r.vestidoId === vestidoA)).toBe(true);
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
    if (m.ok) await cancelarReserva(loja, m.id);
    const livre = await reservarVestido(loja, {
      vestidoId: vestidoB,
      leadId: noiva,
      casamentoData: "2027-03-15",
    });
    expect(livre.ok).toBe(true);
    if (livre.ok) await cancelarReserva(loja, livre.bloqueioId); // limpa p/ não vazar
  });

  it("recusa manutenção com datas invertidas", async () => {
    const r = await criarManutencao(loja, { vestidoId: vestidoB, inicio: "2027-05-10", fim: "2027-05-01" });
    expect(r).toMatchObject({ ok: false, motivo: "datas_invertidas" });
  });
});
