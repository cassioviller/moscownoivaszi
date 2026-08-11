import { describe, expect, it } from "vitest";
import {
  ajustesDaSemana,
  casamentoDeReferencia,
  prazoDias,
  rotuloCasamento,
  rotuloProva,
} from "./ajustes-da-semana";

/** Um dia YMD a N dias de hoje, no fuso da loja. */
function emDias(n: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + n * 24 * 3_600_000),
  );
}

describe("ajustesDaSemana — o cartão do painel conta o que a fila mostra (E132)", () => {
  it("pendente com prova em 3 dias entra; em 10 dias fica fora", () => {
    const dentro = { status: "PENDENTE", proximaProva: emDias(3) };
    const fora = { status: "PENDENTE", proximaProva: emDias(10) };
    expect(ajustesDaSemana([dentro, fora])).toEqual([dentro]);
  });

  it("atrasado é 'da semana' — é o que mais precisa da costureira", () => {
    expect(ajustesDaSemana([{ status: "PENDENTE", proximaProva: emDias(-2) }])).toHaveLength(1);
  });

  it("FEITO não conta, mesmo com prova amanhã", () => {
    expect(ajustesDaSemana([{ status: "FEITO", proximaProva: emDias(1) }])).toEqual([]);
  });

  it("sem prova, vale o casamento; sem referência nenhuma, fica fora do recorte", () => {
    const peloCasamento = {
      status: "PENDENTE",
      atendimento: { bloqueio: { casamentoData: emDias(5) } },
    };
    const semReferencia = { status: "PENDENTE" };
    expect(ajustesDaSemana([peloCasamento, semReferencia])).toEqual([peloCasamento]);
    expect(prazoDias(semReferencia)).toBeNull();
  });

  /**
   * E170/A05.5 — o teste acima escrevia o ponto cego como se fosse a intenção.
   *
   * "Sem referência nenhuma fica fora do recorte" é verdade e é inofensiva; o
   * que ela escondia é que a CONFECÇÃO caía nesse ramo por construção. O
   * trabalho cortado do zero não tem peça de acervo, logo não tem reserva, logo
   * não tem `bloqueio.casamentoData` — e o casamento da noiva, que viaja no
   * mesmo payload (`agenda.ts:1002` carrega `lead: true`), era descartado. A
   * peça que leva MAIS tempo era a única fora de "Esta semana", o recorte
   * padrão da costureira (`ajustes/index.tsx:80`).
   *
   * O caso não era testado em lugar nenhum — e é o caso do E170: o teste
   * afirmava o ramo `null` e nunca perguntava por que ele era alcançado.
   */
  it("a confecção sem reserva vale pelo casamento DA NOIVA — é a peça que leva mais tempo", () => {
    const confeccao = {
      status: "PENDENTE",
      atendimento: { bloqueio: null, lead: { casamentoData: emDias(5) } },
    };
    expect(prazoDias(confeccao)).toBe(5);
    expect(ajustesDaSemana([confeccao])).toEqual([confeccao]);
  });

  it("o casamento do BLOQUEIO manda sobre o da noiva quando os dois existem", () => {
    const a = {
      status: "PENDENTE",
      atendimento: {
        bloqueio: { casamentoData: emDias(3) },
        lead: { casamentoData: emDias(40) },
      },
    };
    expect(prazoDias(a)).toBe(3);
  });

  it("a prova segue mandando sobre os dois casamentos", () => {
    const a = {
      status: "PENDENTE",
      proximaProva: emDias(1),
      atendimento: { bloqueio: null, lead: { casamentoData: emDias(40) } },
    };
    expect(prazoDias(a)).toBe(1);
  });

  it("sem prova, sem reserva e sem casamento na ficha, o prazo segue nulo", () => {
    const a = { status: "PENDENTE", atendimento: { bloqueio: null, lead: { casamentoData: null } } };
    expect(prazoDias(a)).toBeNull();
    expect(ajustesDaSemana([a])).toEqual([]);
  });

  it("`casamentoDeReferencia` devolve uma grafia só — o `Date` do tipo gerado vira ISO", () => {
    const comDate = { atendimento: { bloqueio: null, lead: { casamentoData: new Date("2027-05-15T12:00:00Z") } } };
    expect(casamentoDeReferencia(comDate)).toBe("2027-05-15T12:00:00.000Z");
    expect(casamentoDeReferencia({ atendimento: { bloqueio: null, lead: null } })).toBeNull();
  });

  it("a prova manda quando as duas referências existem", () => {
    const a = {
      status: "PENDENTE",
      proximaProva: emDias(2),
      atendimento: { bloqueio: { casamentoData: emDias(30) } },
    };
    expect(prazoDias(a)).toBeLessThanOrEqual(2);
  });

  // S-A17: os rótulos saíram da fila para cá — a ficha do trabalho diz o
  // prazo com as mesmas palavras, e o singular não vira "em 1 dias".
  it("os rótulos do prazo cobrem atrasado, hoje, amanhã e o plural", () => {
    expect(rotuloProva(-1)).toBe("prova atrasada");
    expect(rotuloProva(0)).toBe("prova hoje");
    expect(rotuloProva(1)).toBe("prova amanhã");
    expect(rotuloProva(4)).toBe("prova em 4 dias");
    expect(rotuloCasamento(-1)).toBe("casamento passou");
    expect(rotuloCasamento(0)).toBe("casamento hoje");
    expect(rotuloCasamento(1)).toBe("casamento amanhã");
    expect(rotuloCasamento(14)).toBe("casamento em 14 dias");
  });
});
