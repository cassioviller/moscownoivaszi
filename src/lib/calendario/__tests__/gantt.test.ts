import { describe, it, expect } from "vitest";
import { montarGantt } from "@/lib/calendario/gantt";
import type { EventoAgenda } from "@/lib/disponibilidade/agenda";

const ev = (over: Partial<EventoAgenda>): EventoAgenda => ({
  tipo: "uso",
  rotulo: "Uso / casamento",
  inicio: new Date("2026-06-11T00:00:00.000Z"),
  fim: new Date("2026-06-13T00:00:00.000Z"),
  abertoFim: false,
  vestidoId: "v1",
  vestidoNome: "Aurora",
  vestidoCodigo: "A-01",
  noivaNome: "Bia",
  ...over,
});

const janelaInicio = new Date("2026-06-01T00:00:00.000Z");

describe("montarGantt", () => {
  it("agrupa barras por vestido (uma linha por vestido)", () => {
    const linhas = montarGantt(
      [
        ev({ tipo: "preparacao", inicio: new Date("2026-06-03T00:00:00.000Z"), fim: new Date("2026-06-05T00:00:00.000Z") }),
        ev({ tipo: "uso", inicio: new Date("2026-06-11T00:00:00.000Z"), fim: new Date("2026-06-13T00:00:00.000Z") }),
      ],
      janelaInicio,
      30,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].vestidoId).toBe("v1");
    expect(linhas[0].barras).toHaveLength(2);
  });

  it("posiciona a barra em % do início da janela (30 dias)", () => {
    const [linha] = montarGantt(
      [ev({ tipo: "uso", inicio: new Date("2026-06-11T00:00:00.000Z"), fim: new Date("2026-06-13T00:00:00.000Z") })],
      janelaInicio,
      30,
    );
    const b = linha.barras[0];
    expect(b.inicioPct).toBeCloseTo((10 / 30) * 100, 5); // dia 11 = +10 dias
    expect(b.larguraPct).toBeCloseTo((2 / 30) * 100, 5); // 11→13 = 2 dias
  });

  it("barra abertoFim vai até o fim da janela (100%)", () => {
    const [linha] = montarGantt(
      [ev({ abertoFim: true, inicio: new Date("2026-06-16T00:00:00.000Z"), fim: new Date("9999-12-31T00:00:00.000Z") })],
      janelaInicio,
      30,
    );
    const b = linha.barras[0];
    expect(b.inicioPct).toBeCloseTo((15 / 30) * 100, 5);
    expect(b.inicioPct + b.larguraPct).toBeCloseTo(100, 5);
    expect(b.abertoFim).toBe(true);
  });

  it("recorta nas bordas (não passa de 0% nem de 100%)", () => {
    const [linha] = montarGantt(
      [ev({ inicio: new Date("2026-05-20T00:00:00.000Z"), fim: new Date("2026-07-20T00:00:00.000Z") })],
      janelaInicio,
      30,
    );
    const b = linha.barras[0];
    expect(b.inicioPct).toBe(0);
    expect(b.inicioPct + b.larguraPct).toBeCloseTo(100, 5);
  });

  it("ordena as linhas pela barra mais à esquerda", () => {
    const linhas = montarGantt(
      [
        ev({ vestidoId: "v2", inicio: new Date("2026-06-20T00:00:00.000Z"), fim: new Date("2026-06-22T00:00:00.000Z") }),
        ev({ vestidoId: "v1", inicio: new Date("2026-06-03T00:00:00.000Z"), fim: new Date("2026-06-05T00:00:00.000Z") }),
      ],
      janelaInicio,
      30,
    );
    expect(linhas.map((l) => l.vestidoId)).toEqual(["v1", "v2"]);
  });
});
