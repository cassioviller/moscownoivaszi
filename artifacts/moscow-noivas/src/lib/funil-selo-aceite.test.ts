import { describe, expect, it } from "vitest";
import { mostraSeloAceite } from "./funil";

/**
 * S-O10 — a decisão registrada: **o aceite é carimbo, não coluna.**
 *
 * Quem olha o funil para achar onde a venda emperrou não distinguia "mandei a
 * proposta" de "ela já disse sim" — as duas moram em ORCAMENTO_ABERTO. A
 * décima segunda coluna resolveria isso cobrando enum do banco, régua de
 * transição, régua de conversão e mais uma coluna para arrastar no celular; o
 * selo resolve pelo preço de um carimbo em `leads.aceiteEm`.
 */
describe("S-O10 — o selo de aceite no card do funil", () => {
  it("acende para a noiva que disse sim e ainda não tem contrato", () => {
    expect(mostraSeloAceite({ aceiteEm: "2026-08-11T14:00:00Z" })).toBe(true);
  });

  it("fica apagado para quem ainda não aceitou — que é a maioria do funil", () => {
    expect(mostraSeloAceite({ aceiteEm: null })).toBe(false);
    expect(mostraSeloAceite({})).toBe(false);
  });

  /**
   * O selo é sobre o que FALTA, não sobre o que aconteceu. Fechado o contrato,
   * o aceite virou história e o card tem outra coisa a dizer — deixá-lo aceso
   * transformaria o selo em moldura, que é como um aviso deixa de ser lido.
   */
  it("apaga quando o contrato fecha — o aceite virou história", () => {
    expect(
      mostraSeloAceite({
        aceiteEm: "2026-08-11T14:00:00Z",
        contratoFechadoEm: "2026-08-12T10:00:00Z",
      }),
    ).toBe(false);
  });
});
