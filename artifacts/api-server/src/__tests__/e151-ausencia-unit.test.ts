import { describe, expect, it } from "vitest";
import {
  ausenciaQueCobre,
  instanteDoSlot,
  recusaDeMover,
  slotsOferecidos,
  type Ausencia,
  type Expediente,
  type Marcacao,
} from "@workspace/agenda-core";

/**
 * E151 — a ausência da vendedora, na régua que decide o agendamento.
 *
 * No papel a ausência é a primeira coisa que a página declara: 7 das 14 páginas
 * do caderno a anunciam, e nas semanas de férias a agenda esvazia — 09 e 10/07
 * riscados com um X que atravessa as duas colunas. No sistema não existia nada,
 * e a agenda oferecia alegremente o dia inteiro de quem estava viajando.
 *
 * O que se prega aqui: a recusa é sobre o DIA (como o expediente), é da PESSOA
 * (não da loja), e o intervalo é inclusivo nas duas pontas.
 */
const EXPEDIENTE: Expediente = { aberturaHora: 9, fechamentoHora: 19 };

const marilza: Marcacao = {
  id: "a1",
  cabineId: "cab1",
  vendedoraId: "marilza",
  inicio: instanteDoSlot("2026-08-10", "10:00"),
};

const ferias: Ausencia[] = [{ usuarioId: "marilza", inicio: "2026-08-17", fim: "2026-08-24" }];

const alvo = (dia: string, slot: string) => instanteDoSlot(dia, slot);

describe("E151 — a ausência cobre o dia", () => {
  it("o primeiro e o último dia contam — quem digita 17 a 24 volta no 25", () => {
    expect(ausenciaQueCobre(ferias, "marilza", alvo("2026-08-17", "10:00"))).not.toBeNull();
    expect(ausenciaQueCobre(ferias, "marilza", alvo("2026-08-24", "18:00"))).not.toBeNull();
    expect(ausenciaQueCobre(ferias, "marilza", alvo("2026-08-25", "09:00"))).toBeNull();
    expect(ausenciaQueCobre(ferias, "marilza", alvo("2026-08-16", "18:00"))).toBeNull();
  });

  it("a ausência é DE UMA PESSOA — a colega segue atendendo", () => {
    expect(ausenciaQueCobre(ferias, "isa", alvo("2026-08-20", "10:00"))).toBeNull();
  });

  it("o dia é o LOCAL da loja, não o UTC", () => {
    // 21h de 16/08 em São Paulo é dia 17 em UTC. Se a comparação fosse feita
    // sobre o instante cru, a vendedora seria recusada na véspera das férias —
    // o mesmo defeito de fuso que já custou caro na disponibilidade.
    const vespera = new Date("2026-08-17T00:30:00Z"); // 16/08 21:30 em SP
    expect(ausenciaQueCobre(ferias, "marilza", vespera)).toBeNull();
  });

  it("sem ausência nenhuma, a régua responde rápido e em silêncio", () => {
    expect(ausenciaQueCobre([], "marilza", alvo("2026-08-20", "10:00"))).toBeNull();
  });
});

describe("E151 — a agenda respeita a ausência", () => {
  it("marcar no meio das férias é recusado com motivo próprio", () => {
    expect(
      recusaDeMover(
        marilza,
        { cabineId: "cab1", inicio: alvo("2026-08-20", "15:00") },
        [],
        EXPEDIENTE,
        ferias,
      ),
    ).toBe("VENDEDORA_AUSENTE");
  });

  it("fora do período, o mesmo movimento passa", () => {
    expect(
      recusaDeMover(
        marilza,
        { cabineId: "cab1", inicio: alvo("2026-08-25", "15:00") },
        [],
        EXPEDIENTE,
        ferias,
      ),
    ).toBeNull();
  });

  it("a ausência da COLEGA não impede esta vendedora", () => {
    const daIsa: Ausencia[] = [{ usuarioId: "isa", inicio: "2026-08-17", fim: "2026-08-24" }];
    expect(
      recusaDeMover(
        marilza,
        { cabineId: "cab1", inicio: alvo("2026-08-20", "15:00") },
        [],
        EXPEDIENTE,
        daIsa,
      ),
    ).toBeNull();
  });

  it("o dia fechado ainda vem primeiro — a loja fechada não é problema de gente", () => {
    // Ausência num dia em que a loja também não abre: o motivo é o da loja,
    // porque é o que a vendedora precisa resolver primeiro.
    const comDomingoFechado: Expediente = { ...EXPEDIENTE, dias: [1, 2, 3, 4, 5, 6] };
    expect(
      recusaDeMover(
        marilza,
        { cabineId: "cab1", inicio: alvo("2026-08-23", "15:00") }, // domingo
        [],
        comDomingoFechado,
        ferias,
      ),
    ).toBe("LOJA_FECHADA");
  });

  it("sem passar ausências, a régua é a de antes — nada quebra por omissão", () => {
    expect(
      recusaDeMover(marilza, { cabineId: "cab1", inicio: alvo("2026-08-20", "15:00") }, [], EXPEDIENTE),
    ).toBeNull();
  });

  it("a TELA não oferece slot nenhum no dia da ausência", () => {
    // Doutrina do E27: a grade recusa a célula ANTES do gesto. Oferecer o dia
    // inteiro e falhar no clique é o que este épico veio tirar.
    const slots = slotsOferecidos(
      "2026-08-20",
      { cabineId: "cab1", vendedoraId: "marilza" },
      [],
      EXPEDIENTE,
      ferias,
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.recusa === "VENDEDORA_AUSENTE")).toBe(true);

    const depois = slotsOferecidos(
      "2026-08-25",
      { cabineId: "cab1", vendedoraId: "marilza" },
      [],
      EXPEDIENTE,
      ferias,
    );
    expect(depois.some((s) => s.recusa === null)).toBe(true);
  });
});
