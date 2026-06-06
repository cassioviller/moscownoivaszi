import { describe, it, expect } from "vitest";
import {
  diasAteCasamento,
  rotuloContagem,
  casamentoUrgente,
  JANELA_URGENCIA_DIAS,
} from "@/lib/leads/contagem-casamento";

const ymd = (s: string) => new Date(`${s}T00:00:00.000Z`);
// "Hoje" fixo (com hora) para provar que a contagem ignora o horário e usa só o dia UTC.
const hoje = new Date("2026-06-06T15:30:00.000Z");

describe("diasAteCasamento", () => {
  it("conta em dias de calendário UTC, ignorando a hora de 'hoje'", () => {
    expect(diasAteCasamento(ymd("2026-06-06"), hoje)).toBe(0);
    expect(diasAteCasamento(ymd("2026-06-07"), hoje)).toBe(1);
    expect(diasAteCasamento(ymd("2026-06-20"), hoje)).toBe(14);
    expect(diasAteCasamento(ymd("2026-06-21"), hoje)).toBe(15);
  });
  it("é negativo quando o casamento já passou", () => {
    expect(diasAteCasamento(ymd("2026-06-01"), hoje)).toBe(-5);
  });
});

describe("rotuloContagem", () => {
  it("humaniza hoje, amanhã e o futuro", () => {
    expect(rotuloContagem(0)).toBe("É hoje");
    expect(rotuloContagem(1)).toBe("Amanhã");
    expect(rotuloContagem(9)).toBe("Em 9 dias");
  });
});

describe("casamentoUrgente", () => {
  it("verdadeiro só dentro da janela e no presente/futuro", () => {
    expect(casamentoUrgente(0)).toBe(true);
    expect(casamentoUrgente(JANELA_URGENCIA_DIAS)).toBe(true);
    expect(casamentoUrgente(JANELA_URGENCIA_DIAS + 1)).toBe(false);
    expect(casamentoUrgente(-1)).toBe(false);
  });
});
