import { describe, it, expect } from "vitest";
import { escolherDestaque, type CandidataDestaque } from "../jornada-destaque";

const hoje = new Date(Date.UTC(2026, 6, 4)); // 2026-07-04

function cand(over: Partial<CandidataDestaque>): CandidataDestaque {
  return { id: "x", noivaNome: "N", casamentoData: new Date(Date.UTC(2026, 8, 1)), ativa: true, ...over };
}

describe("escolherDestaque", () => {
  it("escolhe a ativa com casamento futuro mais próximo", () => {
    const r = escolherDestaque(
      [
        cand({ id: "a", casamentoData: new Date(Date.UTC(2026, 8, 1)) }),
        cand({ id: "b", casamentoData: new Date(Date.UTC(2026, 6, 20)) }),
        cand({ id: "c", casamentoData: new Date(Date.UTC(2027, 0, 1)) }),
      ],
      hoje,
    );
    expect(r?.id).toBe("b");
  });

  it("ignora encerradas/inativas e datas passadas", () => {
    const r = escolherDestaque(
      [
        cand({ id: "a", ativa: false, casamentoData: new Date(Date.UTC(2026, 6, 10)) }),
        cand({ id: "b", casamentoData: new Date(Date.UTC(2026, 6, 1)) }), // passado
        cand({ id: "c", casamentoData: new Date(Date.UTC(2026, 9, 1)) }),
      ],
      hoje,
    );
    expect(r?.id).toBe("c");
  });

  it("devolve null quando não há candidata elegível", () => {
    expect(escolherDestaque([], hoje)).toBeNull();
    expect(escolherDestaque([cand({ ativa: false })], hoje)).toBeNull();
  });
});
