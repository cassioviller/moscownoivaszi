import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, cabinesTable, atendimentosTable, contratoItensTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarVestido,
  criarRegraDisponibilidade,
  criarBloqueio,
  criarContrato,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * Utilização por vestido (E15): TODOS os vestidos do acervo com provas,
 * reservas e contratos do período — zeros incluídos (o encalhado é a
 * resposta). Contrato CANCELADO não conta; o recorte de/ate corta de verdade.
 */

describe("Vestidos — utilização (E15)", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    ag = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await criarRegraDisponibilidade(f);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const buscar = (query = "") =>
    ag.get(`/api/lojas/${f.lojaId}/vestidos/utilizacao${query}`);

  it("agrega provas, reservas e contratos por vestido — e o parado vem zerado", async () => {
    const lead = await criarLead(f);
    const estrela = await criarVestido(f);
    const parado = await criarVestido(f);

    // Reserva ativa com prova marcada.
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: estrela.id,
      leadId: lead.id,
      casamentoData: dataFutura(-30),
    });
    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: "Cabine Util" });
    await db.insert(atendimentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: lead.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: bloqueio.id,
      inicio: dataFutura(-45),
    });

    // Contrato ATIVO com item VESTIDO (2 × 3500) + um CANCELADO que NÃO conta.
    const ativo = await criarContrato(f, { leadId: lead.id, valorTotal: 7000, fechadoEm: dataFutura(-40) });
    const cancelado = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 9999,
      fechadoEm: dataFutura(-40),
      canceladoEm: dataFutura(-35),
    });
    await db.insert(contratoItensTable).values([
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: ativo.id,
        tipo: "VESTIDO",
        vestidoId: estrela.id,
        descricao: "Aluguel",
        valorUnitario: 3500,
        quantidade: 2,
      },
      {
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: cancelado.id,
        tipo: "VESTIDO",
        vestidoId: estrela.id,
        descricao: "Aluguel cancelado",
        valorUnitario: 9999,
        quantidade: 1,
      },
    ]);

    const res = await buscar().expect(200);
    const porId = new Map(res.body.map((v: { vestidoId: string }) => [v.vestidoId, v]));

    const e = porId.get(estrela.id) as Record<string, unknown>;
    expect(e).toMatchObject({ provas: 1, reservas: 1, contratos: 1, receita: 7000 });

    // O sem uso APARECE, zerado — é ele que a dona procura.
    const p = porId.get(parado.id) as Record<string, unknown>;
    expect(p).toMatchObject({ provas: 0, reservas: 0, contratos: 0, receita: 0 });
  });

  it("o recorte de/ate corta: período sem os eventos devolve tudo zerado", async () => {
    // Janela futura, longe do casamento (-30d), da prova (-45d) e do fecho (-40d).
    const de = dataFutura(100).toISOString().slice(0, 10);
    const ate = dataFutura(130).toISOString().slice(0, 10);
    const res = await buscar(`?de=${de}&ate=${ate}`).expect(200);
    for (const v of res.body) {
      expect(v.provas + v.reservas + v.contratos).toBe(0);
    }
  });

  it("intervalo invertido é 400", async () => {
    await buscar("?de=2026-08-01&ate=2026-07-01").expect(400);
  });
});
