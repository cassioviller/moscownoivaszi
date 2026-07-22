import { describe, expect, it } from "vitest";
import {
  slotsOferecidos,
  instanteDoSlot,
  type Marcacao,
  type Expediente,
} from "@workspace/agenda-core";

/**
 * E64 — a agenda passa a OFERECER, não só recusar.
 *
 * O formulário de agendamento usava input de hora livre e o conflito só
 * aparecia como erro da API depois do submit. `slotsOferecidos` percorre a
 * malha do dia com a MESMA régua do arraste (`recusaDeMover`) e devolve cada
 * slot com o veredito — a tela mostra o livre e explica o ocupado.
 */

const EXPEDIENTE: Expediente = { aberturaHora: 9, fechamentoHora: 11, provaDuracao: 2 };
// 2026-08-10 é uma segunda-feira.
const DIA = "2026-08-10";
const CANDIDATA = { cabineId: "cab-1", vendedoraId: "vend-1" } as const;

const marcacao = (over: Partial<Marcacao> & { inicio: Date | string }): Marcacao => ({
  id: "m-1",
  cabineId: "cab-1",
  vendedoraId: "vend-1",
  ...over,
});

describe("slotsOferecidos (E64)", () => {
  it("dia vazio: todos os slots da malha vêm livres", () => {
    const slots = slotsOferecidos(DIA, CANDIDATA, [], EXPEDIENTE);
    expect(slots.map((s) => s.slot)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(slots.every((s) => s.recusa === null)).toBe(true);
  });

  it("cabine ocupada explica o slot; o resto segue livre", () => {
    const ocupadas = [marcacao({ inicio: instanteDoSlot(DIA, "09:30") })];
    const slots = slotsOferecidos(DIA, { ...CANDIDATA, vendedoraId: "vend-2" }, ocupadas, EXPEDIENTE);
    expect(slots.find((s) => s.slot === "09:30")?.recusa).toBe("CABINE_OCUPADA");
    expect(slots.find((s) => s.slot === "09:00")?.recusa).toBeNull();
  });

  it("vendedora ocupada em OUTRA cabine também recusa", () => {
    const ocupadas = [marcacao({ cabineId: "cab-2", inicio: instanteDoSlot(DIA, "10:00") })];
    const slots = slotsOferecidos(DIA, CANDIDATA, ocupadas, EXPEDIENTE);
    expect(slots.find((s) => s.slot === "10:00")?.recusa).toBe("VENDEDORA_OCUPADA");
  });

  it("uma PROVA existente ocupa provaDuracao slots — o seguinte também recusa", () => {
    const ocupadas = [marcacao({ tipo: "PROVA", inicio: instanteDoSlot(DIA, "09:00") })];
    const slots = slotsOferecidos(DIA, { ...CANDIDATA, vendedoraId: "vend-2" }, ocupadas, EXPEDIENTE);
    expect(slots.find((s) => s.slot === "09:00")?.recusa).toBe("CABINE_OCUPADA");
    expect(slots.find((s) => s.slot === "09:30")?.recusa).toBe("CABINE_OCUPADA");
    expect(slots.find((s) => s.slot === "10:00")?.recusa).toBeNull();
  });

  it("agendar uma PROVA nova reprova o slot que colidiria com o próximo", () => {
    const ocupadas = [marcacao({ inicio: instanteDoSlot(DIA, "10:00") })];
    const slots = slotsOferecidos(DIA, { ...CANDIDATA, vendedoraId: "vend-2", tipo: "PROVA" }, ocupadas, EXPEDIENTE);
    // A prova de 09:30 duraria até 10:30 e esbarraria no atendimento de 10:00.
    expect(slots.find((s) => s.slot === "09:30")?.recusa).toBe("CABINE_OCUPADA");
    expect(slots.find((s) => s.slot === "09:00")?.recusa).toBeNull();
  });

  it("dia em que a loja fecha: a malha inteira vem LOJA_FECHADA", () => {
    // Segunda (1) fora dos dias de funcionamento.
    const slots = slotsOferecidos(DIA, CANDIDATA, [], { ...EXPEDIENTE, dias: [2, 3, 4, 5, 6] });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.recusa === "LOJA_FECHADA")).toBe(true);
  });
});
