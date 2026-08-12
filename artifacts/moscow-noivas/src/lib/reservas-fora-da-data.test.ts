import { describe, expect, it } from "vitest";
import { reservasForaDaData, type ReservaDaNoiva } from "./reservas-fora-da-data";

/**
 * S-O74/E189 — a régua que faz o V5 aparecer na ficha da noiva.
 *
 * O servidor sabe mover a reserva desde o E173 (e o contrato ATIVO junto, com
 * `CONTRATO_DATA_SEGUIU_RESERVA` na trilha); o que faltava era alguém PERGUNTAR
 * se ela precisa ser movida. Esta é a pergunta.
 */

/** 12/09/2028, como o `diaParaISO` da tela grava: meio-dia de São Paulo. */
const DOZE_DE_SETEMBRO = "2028-09-12T15:00:00.000Z";
const TRES_DE_OUTUBRO = "2028-10-03T15:00:00.000Z";

function reserva(over: Partial<ReservaDaNoiva> = {}): ReservaDaNoiva {
  return {
    id: "r1",
    casamentoData: DOZE_DE_SETEMBRO,
    status: "CONFIRMADA",
    bloqueios: [
      { canceladoEm: null, vestido: { codigo: "V-001", nome: "Sereia Marfim" } },
    ],
    ...over,
  };
}

describe("as reservas que ficaram para trás quando a noiva mudou o casamento", () => {
  it("a ficha diz 03/10 e a reserva ficou em 12/09 — com as peças presas nela", () => {
    const aviso = reservasForaDaData(TRES_DE_OUTUBRO, [reserva()]);
    expect(aviso).toEqual({
      dia: "2028-10-03",
      // O destino cru, para o gesto não ter de reler (e afirmar) a ficha.
      instante: TRES_DE_OUTUBRO,
      foraDaData: [
        { reservaId: "r1", dia: "2028-09-12", pecas: ["V-001 · Sereia Marfim"] },
      ],
    });
  });

  it("mesmo dia escrito com outra precisão continua sendo o mesmo casamento", () => {
    // O instante é o mesmo; a grafia, não. Comparar as strings cruas acusaria
    // divergência e mandaria a vendedora mover uma reserva que já está certa.
    expect(reservasForaDaData("2028-09-12T15:00:00Z", [reserva()])).toBeNull();
  });

  it("reserva CONCLUIDA fica fora — o casamento já aconteceu", () => {
    expect(
      reservasForaDaData(TRES_DE_OUTUBRO, [reserva({ status: "CONCLUIDA" })]),
    ).toBeNull();
  });

  it("reserva CANCELADA fica fora — a peça já voltou ao acervo", () => {
    expect(
      reservasForaDaData(TRES_DE_OUTUBRO, [reserva({ status: "CANCELADA" })]),
    ).toBeNull();
  });

  it("sem data na ficha não há para onde mover, e sem reserva não há o que mover", () => {
    expect(reservasForaDaData(null, [reserva()])).toBeNull();
    expect(reservasForaDaData(undefined, [reserva()])).toBeNull();
    expect(reservasForaDaData(TRES_DE_OUTUBRO, [])).toBeNull();
    expect(reservasForaDaData(TRES_DE_OUTUBRO, undefined)).toBeNull();
  });

  it("a peça soft-cancelada não é anunciada como presa — ela já saiu da reserva", () => {
    const aviso = reservasForaDaData(TRES_DE_OUTUBRO, [
      reserva({
        bloqueios: [
          { canceladoEm: "2026-08-12T12:00:00.000Z", vestido: { codigo: "V-001", nome: "Sereia" } },
          { canceladoEm: null, vestido: { codigo: "V-002", nome: "Véu longo" } },
        ],
      }),
    ]);
    expect(aviso!.foraDaData[0]!.pecas).toEqual(["V-002 · Véu longo"]);
  });

  it("duas reservas atrasadas saem da mais antiga para a mais recente", () => {
    const aviso = reservasForaDaData(TRES_DE_OUTUBRO, [
      reserva({ id: "depois", casamentoData: "2028-09-20T15:00:00.000Z" }),
      reserva({ id: "antes", casamentoData: DOZE_DE_SETEMBRO }),
    ]);
    expect(aviso!.foraDaData.map((r) => r.reservaId)).toEqual(["antes", "depois"]);
  });

  it("reserva sem peça viva ainda é anunciada — a data dela é o que está errado", () => {
    const aviso = reservasForaDaData(TRES_DE_OUTUBRO, [reserva({ bloqueios: [] })]);
    expect(aviso!.foraDaData).toEqual([
      { reservaId: "r1", dia: "2028-09-12", pecas: [] },
    ]);
  });
});
