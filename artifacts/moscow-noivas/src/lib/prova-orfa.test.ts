import { describe, expect, it } from "vitest";
import {
  contarProvasOrfas,
  provaPerdeuOVestido,
  PROVA_ORFA_EXPLICACAO,
  PROVA_ORFA_SELO,
  type AtendimentoParaOrfandade,
} from "./prova-orfa";

const prova = (over: Partial<AtendimentoParaOrfandade> = {}): AtendimentoParaOrfandade => ({
  tipo: "PROVA",
  situacao: "AGENDADO",
  bloqueio: { canceladoEm: "2026-08-12T08:05:59.072Z" },
  ...over,
});

describe("provaPerdeuOVestido — S-O5", () => {
  it("acusa a prova de pé cujo bloqueio foi cancelado", () => {
    expect(provaPerdeuOVestido(prova())).toBe(true);
  });

  it("a prova com reserva viva não é órfã", () => {
    expect(provaPerdeuOVestido(prova({ bloqueio: { canceladoEm: null } }))).toBe(false);
  });

  it("atendimento comum não tem vestido para perder", () => {
    // Só PROVA exige `bloqueioId` (G7/A06.3). Um ATENDIMENTO sem bloqueio não
    // promete peça nenhuma, e acusá-lo seria alarme falso na agenda inteira.
    expect(provaPerdeuOVestido(prova({ tipo: "ATENDIMENTO", bloqueio: null }))).toBe(false);
  });

  it("prova sem bloqueio nenhum não é órfã", () => {
    expect(provaPerdeuOVestido(prova({ bloqueio: null }))).toBe(false);
  });

  it("prova CONCLUIDO ou FALTOU é história, não promessa", () => {
    // A noiva já veio, ou já não veio. Avisar sobre o vestido de um fato
    // passado é ruído numa tela que a loja lê o dia inteiro.
    expect(provaPerdeuOVestido(prova({ situacao: "CONCLUIDO" }))).toBe(false);
    expect(provaPerdeuOVestido(prova({ situacao: "FALTOU" }))).toBe(false);
  });

  it("EM_ATENDIMENTO conta — ela está na cabine AGORA", () => {
    // É o pior momento para a loja descobrir sozinha, e por isso é o caso que
    // mais precisa do selo.
    expect(provaPerdeuOVestido(prova({ situacao: "EM_ATENDIMENTO" }))).toBe(true);
  });

  it("nulo e indefinido não quebram a grade", () => {
    expect(provaPerdeuOVestido(null)).toBe(false);
    expect(provaPerdeuOVestido(undefined)).toBe(false);
  });
});

describe("contarProvasOrfas", () => {
  it("conta só as que perderam o vestido", () => {
    expect(
      contarProvasOrfas([
        prova(),
        prova({ bloqueio: { canceladoEm: null } }),
        prova({ situacao: "CONCLUIDO" }),
        prova(),
      ]),
    ).toBe(2);
  });

  it("lista vazia dá zero, que é o normal da loja", () => {
    expect(contarProvasOrfas([])).toBe(0);
  });
});

describe("as frases", () => {
  it("o selo é curto — ele cabe num card de agenda", () => {
    expect(PROVA_ORFA_SELO.length).toBeLessThanOrEqual(24);
  });

  it("a explicação diz a CONSEQUÊNCIA e o que fazer, não o estado interno", () => {
    expect(PROVA_ORFA_EXPLICACAO).toMatch(/vestido saiu desta noiva/i);
    expect(PROVA_ORFA_EXPLICACAO).toMatch(/confirme com ela|desmarque/i);
    expect(PROVA_ORFA_EXPLICACAO).not.toMatch(/canceladoEm|bloqueio|null/i);
  });
});
