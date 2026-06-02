import { describe, it, expect } from "vitest";
import { gradeDeSlots, DURACAO_MIN } from "@/lib/atendimentos/slots";

describe("gradeDeSlots", () => {
  it("gera um slot por hora de abertura a fechamento (exclusivo)", () => {
    const g = gradeDeSlots(9, 12, []);
    expect(g.map((s) => s.hora)).toEqual([9, 10, 11]);
    expect(g.every((s) => s.livre)).toBe(true);
  });
  it("marca horas ocupadas como não-livres", () => {
    const g = gradeDeSlots(9, 12, [10]);
    expect(g.find((s) => s.hora === 10)!.livre).toBe(false);
    expect(g.find((s) => s.hora === 9)!.livre).toBe(true);
  });
  it("ignora horas ocupadas fora da janela", () => {
    const g = gradeDeSlots(9, 12, [20]);
    expect(g.every((s) => s.livre)).toBe(true);
  });
  it("duração é 60 min", () => {
    expect(DURACAO_MIN).toBe(60);
  });
});
