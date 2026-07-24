import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, cabinesTable, atendimentosTable, ajustesTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarVestido,
  criarRegraDisponibilidade,
  criarBloqueio,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Fila da costureira (E14): o prazo real de um ajuste é a PRÓXIMA prova do
 * mesmo bloqueio — é para ela que a peça precisa estar pronta. O GET /ajustes
 * calcula `proximaProva` por ajuste; sem prova seguinte, vem null (o front cai
 * para a data do casamento).
 */

describe("Ajustes — proximaProva na fila (E14)", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;
  let cabineId: string;

  beforeAll(async () => {
    f = await criarFixture();
    ag = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await criarRegraDisponibilidade(f);
    cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine Fila" });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function criarProva(leadId: string, bloqueioId: string | null, inicio: Date): Promise<string> {
    const id = randomUUID();
    await db.insert(atendimentosTable).values({
      id,
      lojaId: f.lojaId,
      leadId,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId,
      inicio,
    });
    return id;
  }

  async function criarAjuste(atendimentoId: string, descricao: string): Promise<string> {
    const id = randomUUID();
    await db.insert(ajustesTable).values({
      id,
      lojaId: f.lojaId,
      atendimentoId,
      descricao,
    });
    return id;
  }

  it("aponta a próxima prova do MESMO bloqueio; a última prova fica sem (null)", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const outroVestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(60),
    });
    const outroBloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: outroVestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(90),
    });

    const prova1 = await criarProva(lead.id, bloqueio.id, dataFutura(10));
    const prova2Inicio = dataFutura(20);
    await criarProva(lead.id, bloqueio.id, prova2Inicio);
    // Prova de OUTRO bloqueio entre as duas: não pode virar prazo deste ajuste.
    await criarProva(lead.id, outroBloqueio.id, dataFutura(15));

    const ajusteProva1 = await criarAjuste(prova1, "Barra do vestido");

    const res = await ag.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const daFila = res.body.find((a: { id: string }) => a.id === ajusteProva1);
    expect(daFila).toBeDefined();
    expect(new Date(daFila.proximaProva).getTime()).toBe(prova2Inicio.getTime());
  });

  it("ajuste da última prova (nada à frente) vem com proximaProva null", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(120),
    });
    const provaUnica = await criarProva(lead.id, bloqueio.id, dataFutura(30));
    const ajuste = await criarAjuste(provaUnica, "Ajuste final");

    const res = await ag.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const daFila = res.body.find((a: { id: string }) => a.id === ajuste);
    expect(daFila.proximaProva).toBeNull();
  });
});
