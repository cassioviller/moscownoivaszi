import { describe, expect, it } from "vitest";
import { ajustesDaSemana, prazoDias, rotuloCasamento, rotuloProva } from "./ajustes-da-semana";

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
