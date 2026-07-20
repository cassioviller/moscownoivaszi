import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ratearRestante } from "../lib/parcelas";

/**
 * Testes de PROPRIEDADE do rateio (E16): C6 provou que centavo morde — aqui a
 * aritmética do gerar-plano é provada para QUALQUER valor/n, não para meia
 * dúzia de exemplos. Sem IO: a função é pura, fast-check roda milhares de
 * casos por milissegundos.
 */

// Até R$ 1 bilhão em centavos; até 360 parcelas (30 anos mensais) — folga
// ampla sobre qualquer contrato real de atelier.
const arbRestante = fc.integer({ min: 0, max: 100_000_000_000 });
const arbN = fc.integer({ min: 1, max: 360 });

describe("ratearRestante — propriedades (E16)", () => {
  it("a soma das parcelas é EXATAMENTE o restante, para qualquer valor/n", () => {
    fc.assert(
      fc.property(arbRestante, arbN, (restante, n) => {
        const parcelas = ratearRestante(restante, n);
        expect(parcelas).toHaveLength(n);
        expect(parcelas.reduce((a, b) => a + b, 0)).toBe(restante);
      }),
    );
  });

  it("nenhuma parcela é negativa e a sobra fica só na última (menos de n centavos)", () => {
    fc.assert(
      fc.property(arbRestante, arbN, (restante, n) => {
        const parcelas = ratearRestante(restante, n);
        const base = Math.floor(restante / n);
        for (const p of parcelas) expect(p).toBeGreaterThanOrEqual(0);
        // As n−1 primeiras são idênticas; a última carrega o resto da divisão.
        for (const p of parcelas.slice(0, -1)) expect(p).toBe(base);
        expect(parcelas[n - 1] - base).toBe(restante % n);
        expect(parcelas[n - 1] - base).toBeLessThan(n);
      }),
    );
  });

  it("sobrevive à ida e volta reais↔centavos que o banco impõe (valor/100 → round(×100))", () => {
    // A rota grava valorPrevisto = centavos/100 (float) e todo o resto do
    // sistema volta com Math.round(×100). Se algum centavo se perdesse na
    // conversão, a soma re-lida divergiria — é exatamente o bug que a
    // validação PARCELAS_NAO_BATEM do contrato recusaria.
    fc.assert(
      fc.property(arbRestante, arbN, (restante, n) => {
        const relidas = ratearRestante(restante, n).map((c) => Math.round((c / 100) * 100));
        expect(relidas.reduce((a, b) => a + b, 0)).toBe(restante);
      }),
    );
  });

  it("com entrada: entrada + parcelas fecham o total do contrato, sempre", () => {
    // A composição que a rota faz: restante = total − entrada (entrada ≤ total).
    const arbTotalEntrada = fc
      .tuple(fc.integer({ min: 0, max: 100_000_000_000 }), fc.integer({ min: 0, max: 100_000_000_000 }))
      .map(([a, b]) => (a >= b ? { total: a, entrada: b } : { total: b, entrada: a }));
    fc.assert(
      fc.property(arbTotalEntrada, arbN, ({ total, entrada }, n) => {
        const soma = ratearRestante(total - entrada, n).reduce((a, b) => a + b, 0);
        expect(entrada + soma).toBe(total);
      }),
    );
  });
});
