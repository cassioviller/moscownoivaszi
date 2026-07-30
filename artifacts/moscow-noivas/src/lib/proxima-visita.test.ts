import { describe, expect, it } from "vitest";
import { proximaVisita } from "./proxima-visita";

const AGORA = new Date("2026-08-01T10:00:00-03:00");

const visita = (inicio: string, over: Partial<{ tipo: string; situacao: string }> = {}) => ({
  tipo: "PROVA",
  situacao: "AGENDADO",
  inicio,
  ...over,
});

describe("proximaVisita — a resposta de 'que dia mesmo é a minha prova?'", () => {
  it("devolve a mais cedo entre as futuras, não a primeira da lista", () => {
    const proxima = visita("2026-08-12T14:00:00-03:00");
    const depois = visita("2026-09-02T14:00:00-03:00");
    expect(proximaVisita([depois, proxima], AGORA)).toBe(proxima);
  });

  it("a de hoje mais tarde ainda é futura; a de hoje mais cedo já passou", () => {
    const daTarde = visita("2026-08-01T15:00:00-03:00");
    expect(proximaVisita([visita("2026-08-01T09:00:00-03:00"), daTarde], AGORA)).toBe(daTarde);
  });

  it("CONCLUIDO e FALTOU são passado; EM_ATENDIMENTO é agora — nenhum é 'próxima'", () => {
    expect(
      proximaVisita(
        [
          visita("2026-08-12T14:00:00-03:00", { situacao: "CONCLUIDO" }),
          visita("2026-08-13T14:00:00-03:00", { situacao: "FALTOU" }),
          visita("2026-08-01T09:30:00-03:00", { situacao: "EM_ATENDIMENTO" }),
        ],
        AGORA,
      ),
    ).toBeNull();
  });

  it("agenda vazia responde null — e o null é a mensagem do banner", () => {
    expect(proximaVisita([], AGORA)).toBeNull();
  });
});
