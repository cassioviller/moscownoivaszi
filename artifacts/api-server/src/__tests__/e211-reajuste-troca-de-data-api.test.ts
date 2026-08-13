import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  contratoBloqueiosTable,
  contratosTable,
  db,
  parcelasTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E211 — a data que muda tem PREÇO** (contrato de locação, cláusula 17ª
 * §§ 2º e 3º).
 *
 * > §2º — As trocas de datas para o ano seguinte sofrerão reajuste automático
 * > de **10%** do valor total do contrato.
 * > §3º — A partir da **segunda troca** haverá reajuste de **20%** e **30% na
 * > terceira**.
 *
 * Era a única regra do contrato que fazia o ateliê **perder dinheiro** por não
 * estar no sistema. O gesto de mover a data existe desde o E193 e já deixava
 * rastro (`RESERVA_DATA_MOVIDA`); ninguém contava as trocas nem cobrava.
 *
 * A conta pura e a leitura declarada do §3º estão em
 * `financeiro-core/reajuste.ts` e na régua dela
 * (`moscow-noivas/src/lib/financeiro/reajuste.test.ts`). Este arquivo prega o
 * outro lado: **o que a PORTA grava**.
 */
describe("E211 — a data que muda tem preço", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /**
   * Uma noiva com reserva, peça e contrato ATIVO — o arranjo mínimo em que a
   * cláusula incide, porque é o CONTRATO que ela reajusta.
   */
  async function noivaComContrato(valorTotal: number, casamento: Date) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      casamentoData: casamento,
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal,
      fechadoEm: new Date(),
    });
    await db.insert(contratoBloqueiosTable).values({
      contratoId: contrato.id,
      bloqueioId: bloqueio.id,
    });
    return { lead, reserva, contrato };
  }

  const mover = (reservaId: string, dia: string) =>
    agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reservaId}`)
      .send({ casamentoData: `${dia}T12:00:00-03:00` });

  const reajustes = (contratoId: string) =>
    db
      .select()
      .from(parcelasTable)
      .where(and(eq(parcelasTable.contratoId, contratoId), eq(parcelasTable.origem, "REAJUSTE_DATA")));

  const contratoDe = async (id: string) =>
    (await db.select().from(contratosTable).where(eq(contratosTable.id, id)))[0]!;

  it("a troca para o ano seguinte cobra 10% do total, como PARCELA", async () => {
    const { reserva, contrato } = await noivaComContrato(5000, new Date("2027-09-05T12:00:00-03:00"));

    await mover(reserva.id, "2028-09-05").expect(200);

    const linhas = await reajustes(contrato.id);
    expect(linhas).toHaveLength(1);
    // R$ 5.000,00 a 10% = R$ 500,00.
    expect(Number(linhas[0]!.valorPrevisto)).toBe(500);
    expect(linhas[0]!.descricao).toContain("10%");
    // O contador anda: é ele que decide o próximo degrau.
    expect((await contratoDe(contrato.id)).reajustesDeData).toBe(1);
  });

  it("o `valorTotal` do contrato NÃO engorda — a base do próximo reajuste é o que foi assinado", async () => {
    const { reserva, contrato } = await noivaComContrato(5000, new Date("2027-09-05T12:00:00-03:00"));
    await mover(reserva.id, "2028-09-05").expect(200);
    // Se o total subisse, o segundo reajuste sairia sobre 5.500 — e a cláusula
    // diz "do valor total do contrato", que é o assinado.
    expect(Number((await contratoDe(contrato.id)).valorTotal)).toBe(5000);
  });

  it("a escada sobe: segunda troca cobra 20%, terceira 30%", async () => {
    const { reserva, contrato } = await noivaComContrato(5000, new Date("2027-09-05T12:00:00-03:00"));

    await mover(reserva.id, "2028-09-05").expect(200); // 1ª → 10%
    await mover(reserva.id, "2029-09-05").expect(200); // 2ª → 20%
    await mover(reserva.id, "2030-09-05").expect(200); // 3ª → 30%

    const valores = (await reajustes(contrato.id))
      .map((p) => Number(p.valorPrevisto))
      .sort((a, b) => a - b);
    expect(valores).toEqual([500, 1000, 1500]);
    expect((await contratoDe(contrato.id)).reajustesDeData).toBe(3);
  });

  it("trocar de dia DENTRO do mesmo ano não cobra nada, e não anda a escada", async () => {
    const { reserva, contrato } = await noivaComContrato(5000, new Date("2027-09-05T12:00:00-03:00"));

    await mover(reserva.id, "2027-11-20").expect(200);

    expect(await reajustes(contrato.id)).toHaveLength(0);
    expect((await contratoDe(contrato.id)).reajustesDeData).toBe(0);
  });

  it("antecipar para o ano anterior não cobra — a cláusula é sobre adiar", async () => {
    const { reserva, contrato } = await noivaComContrato(5000, new Date("2028-09-05T12:00:00-03:00"));
    await mover(reserva.id, "2027-09-05").expect(200);
    expect(await reajustes(contrato.id)).toHaveLength(0);
  });

  /**
   * A parcela do reajuste é dinheiro como qualquer outro: ela tem de entrar na
   * numeração do contrato, senão o carnê e a cobrança a perdem de vista.
   */
  it("a parcela do reajuste entra na numeração do contrato, depois da última", async () => {
    const { reserva, contrato } = await noivaComContrato(5000, new Date("2027-09-05T12:00:00-03:00"));
    await db.insert(parcelasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 7,
      origem: "PLANO",
      valorPrevisto: 100,
      vencimento: new Date("2027-01-10T12:00:00-03:00"),
    });

    await mover(reserva.id, "2028-09-05").expect(200);

    expect((await reajustes(contrato.id))[0]!.numero).toBe(8);
  });

  it("contrato CANCELADO não é reajustado — reescrever o encerrado falsifica o assinado", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = new Date("2027-09-05T12:00:00-03:00");
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      casamentoData: casamento,
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: new Date(),
      canceladoEm: new Date(),
    });
    await db.insert(contratoBloqueiosTable).values({
      contratoId: contrato.id,
      bloqueioId: bloqueio.id,
    });

    await mover(reserva.id, "2028-09-05").expect(200);

    expect(await reajustes(contrato.id)).toHaveLength(0);
  });
});
