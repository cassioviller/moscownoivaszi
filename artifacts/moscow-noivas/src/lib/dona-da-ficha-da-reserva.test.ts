import { describe, expect, it } from "vitest";
import { casamentoDaDona, donaDaFicha, pecaForaDaDataDaNoiva, temReservaMae } from "./dona-da-ficha-da-reserva";

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

/**
 * E240/S-O98 — a ficha da PEÇA passa a saber que a noiva mudou de data.
 *
 * Vermelho medido antes do conserto: não havia função — a ficha lia
 * `reserva.casamentoData` e desenhava, e nenhuma linha comparava com o
 * casamento da dona (`grep -c casamentoData reservas/[bloqueioId].tsx` = 2,
 * as duas desenhando o dia da peça).
 */
describe("a peça ficou em outro dia que a noiva (E240/S-O98)", () => {
  it("própria: a noiva casa em 03/10 e a peça ficou em 12/09 — a ficha avisa os dois dias", () => {
    const bloqueio = {
      leadId: "n1",
      casamentoData: "2028-09-12T15:00:00.000Z",
      lead: { noivaNome: "Ana", casamentoData: "2028-10-03T15:00:00.000Z" },
    };
    expect(pecaForaDaDataDaNoiva(bloqueio, null)).toEqual({ diaDaNoiva: "2028-10-03", diaDaPeca: "2028-09-12" });
  });

  it("o mesmo dia em duas grafias de instante NÃO diverge — a pergunta é sobre o DIA", () => {
    const bloqueio = {
      leadId: "n1",
      casamentoData: "2028-09-12T15:00:00Z",
      lead: { noivaNome: "Ana", casamentoData: "2028-09-12T15:00:00.000Z" },
    };
    expect(pecaForaDaDataDaNoiva(bloqueio, null)).toBeNull();
  });

  it("herdada: o véu pendurado na mãe compara com o casamento da noiva DA MÃE", () => {
    const veu = { leadId: null, reservaId: "r1", donoLeadId: "n2", casamentoData: "2028-09-12T15:00:00.000Z", lead: null };
    const mae = { leadId: "n2", lead: { noivaNome: "Bia", casamentoData: "2028-09-19T15:00:00.000Z" } };
    expect(casamentoDaDona(veu, mae)).toBe("2028-09-19T15:00:00.000Z");
    expect(pecaForaDaDataDaNoiva(veu, mae)).toEqual({ diaDaNoiva: "2028-09-19", diaDaPeca: "2028-09-12" });
    // Enquanto a mãe não voltou da rede não há data para comparar — e não há aviso falso.
    expect(pecaForaDaDataDaNoiva(veu, undefined)).toBeNull();
  });

  it("sem dona, ou sem data de um dos lados, não há o que dizer", () => {
    expect(pecaForaDaDataDaNoiva({ leadId: null, casamentoData: "2028-09-12T15:00:00.000Z" }, null)).toBeNull();
    expect(pecaForaDaDataDaNoiva({ leadId: "n1", casamentoData: null, lead: { casamentoData: "2028-09-12T15:00:00.000Z" } }, null)).toBeNull();
    expect(pecaForaDaDataDaNoiva({ leadId: "n1", casamentoData: "2028-09-12T15:00:00.000Z", lead: { casamentoData: null } }, null)).toBeNull();
  });
});
