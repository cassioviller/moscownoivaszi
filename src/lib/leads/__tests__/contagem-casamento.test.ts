import { describe, it, expect } from "vitest";
import {
  diasAteCasamento,
  rotuloContagem,
  casamentoUrgente,
  JANELA_URGENCIA_DIAS,
} from "@/lib/leads/contagem-casamento";

const ms = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();
const hojeMs = ms("2026-06-06"); // meia-noite UTC do dia (convenção do sistema)

describe("diasAteCasamento", () => {
  it("conta em dias-calendário UTC a partir de hojeMs", () => {
    expect(diasAteCasamento(new Date("2026-06-06T00:00:00.000Z"), hojeMs)).toBe(0);
    expect(diasAteCasamento(new Date("2026-06-07T00:00:00.000Z"), hojeMs)).toBe(1);
    expect(diasAteCasamento(new Date("2026-06-20T00:00:00.000Z"), hojeMs)).toBe(14);
    expect(diasAteCasamento(new Date("2026-06-21T00:00:00.000Z"), hojeMs)).toBe(15);
  });
  it("é negativo quando o casamento já passou", () => {
    expect(diasAteCasamento(new Date("2026-06-01T00:00:00.000Z"), hojeMs)).toBe(-5);
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
