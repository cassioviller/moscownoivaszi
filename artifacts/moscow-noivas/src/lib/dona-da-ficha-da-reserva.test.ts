import { describe, expect, it } from "vitest";
import { donaDaFicha, temReservaMae } from "./dona-da-ficha-da-reserva";

/**
 * S-O54/E185 — a ficha da reserva passa a perguntar à reserva-mãe.
 *
 * O `useGetReserva` que o E179 gerou não tinha um único chamador: a ficha
 * resolvia tudo pelo caminho do bloqueio, e o véu pendurado numa reserva-mãe
 * aparecia como **"Noiva"** no título e **"esta reserva ainda não tem noiva"**
 * no card *De quem é* — sobre uma peça cuja dona o servidor sabe dizer.
 */
describe("de quem é a peça que a ficha da reserva desenha", () => {
  const mae = { leadId: "noiva-b", lead: { noivaNome: "Beatriz" } };

  it("a peça com lead_id próprio é da noiva dela, e nada muda", () => {
    const d = donaDaFicha(
      { leadId: "noiva-a", donoLeadId: "noiva-a", lead: { noivaNome: "Ana" } },
      null,
    );
    expect(d).toEqual({ leadId: "noiva-a", nome: "Ana", origem: "propria" });
  });

  it("o véu sem lead_id próprio herda a dona da mãe — id E nome", () => {
    const d = donaDaFicha({ leadId: null, donoLeadId: "noiva-b", reservaId: "r1", lead: null }, mae);
    expect(d).toEqual({ leadId: "noiva-b", nome: "Beatriz", origem: "herdada" });
  });

  it("enquanto a mãe não volta, o id do servidor já impede a frase errada", () => {
    const d = donaDaFicha(
      { leadId: null, donoLeadId: "noiva-b", reservaId: "r1", lead: null },
      undefined,
    );
    expect(d.origem).toBe("herdada");
    expect(d.leadId).toBe("noiva-b");
    expect(d.nome).toBeNull();
  });

  it("payload antigo em cache, sem donoLeadId: a mãe responde sozinha", () => {
    const d = donaDaFicha({ leadId: null, reservaId: "r1", lead: null }, mae);
    expect(d).toEqual({ leadId: "noiva-b", nome: "Beatriz", origem: "herdada" });
  });

  it("sem lead_id e sem mãe, aí sim a peça não tem noiva — é o caso da adoção do E162", () => {
    const d = donaDaFicha({ leadId: null, donoLeadId: null, reservaId: null, lead: null }, null);
    expect(d).toEqual({ leadId: null, nome: null, origem: "sem-dona" });
  });

  it("só vale perguntar pela mãe quando ela existe", () => {
    expect(temReservaMae({ reservaId: "r1" })).toBe(true);
    expect(temReservaMae({ reservaId: null })).toBe(false);
    expect(temReservaMae(undefined)).toBe(false);
  });
});
