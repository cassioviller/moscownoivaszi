import { describe, expect, it } from "vitest";
import {
  ETAPAS_LEAD,
  FUNIL_LEAD,
  ETAPAS_EM_NEGOCIACAO,
  DIAS_ATENCAO,
  DIAS_CRITICO,
  etapasAlcancaveis,
  transicaoLeadValida,
  leadParado,
  temperaturaDeParado,
} from "@workspace/funil-core";

/**
 * E27: o funil-core é a régua que backend e kanban compartilham. Os testes de
 * transição já existem no lote6 (via `estados.ts`, que agora reexporta daqui);
 * o que se prova aqui é o que o kanban acrescentou — quais colunas podem
 * receber o card, e desde quando um lead está parado.
 */

describe("funil-core — colunas que podem receber o card", () => {
  it("PERDIDO é alcançável de qualquer etapa do funil", () => {
    for (const etapa of FUNIL_LEAD) {
      expect(etapasAlcancaveis(etapa)).toContain("PERDIDO");
    }
  });

  it("nunca oferece uma etapa para trás", () => {
    const alcancaveis = etapasAlcancaveis("ORCAMENTO_ABERTO");
    expect(alcancaveis).not.toContain("NOVO");
    expect(alcancaveis).not.toContain("EM_ATENDIMENTO");
    expect(alcancaveis).toContain("CONTRATO_FECHADO");
  });

  it("a última etapa do funil só oferece PERDIDO", () => {
    expect(etapasAlcancaveis("DEVOLVIDO"))  .toEqual(["PERDIDO"]);
  });

  it("PERDIDO pode voltar para qualquer etapa do funil, mas não para si", () => {
    expect(etapasAlcancaveis("PERDIDO")).toEqual(FUNIL_LEAD);
  });

  it("o que `etapasAlcancaveis` oferece é exatamente o que a rota aceitaria", () => {
    for (const de of ETAPAS_LEAD) {
      const oferecidas = new Set(etapasAlcancaveis(de));
      for (const para of ETAPAS_LEAD) {
        if (de === para) continue;
        expect(oferecidas.has(para)).toBe(transicaoLeadValida(de, para));
      }
    }
  });
});

describe("funil-core — lead parado sem contato", () => {
  const HOJE = "2026-06-20";

  it("conta desde o último contato", () => {
    const p = leadParado(
      { etapa: "EM_ATENDIMENTO", createdAt: "2026-01-01T12:00:00Z", ultimoContatoEm: "2026-06-10T14:00:00-03:00" },
      HOJE,
    );
    expect(p!.dias).toBe(10);
    expect(p!.nuncaContatada).toBe(false);
  });

  it("sem contato nenhum, conta desde a criação e marca `nuncaContatada`", () => {
    const p = leadParado(
      { etapa: "NOVO", createdAt: "2026-06-01T09:00:00-03:00", ultimoContatoEm: null },
      HOJE,
    );
    expect(p!.dias).toBe(19);
    expect(p!.nuncaContatada).toBe(true);
  });

  it("um contato às 21h conta como aquele dia, não como o seguinte", () => {
    // Lido em UTC, 21h de São Paulo já é o dia seguinte — e o card mostraria
    // um dia a menos. É o off-by-one que `diaLocal` existe para evitar.
    const p = leadParado(
      { etapa: "NOVO", createdAt: "2026-01-01T12:00:00Z", ultimoContatoEm: "2026-06-19T21:30:00-03:00" },
      HOJE,
    );
    expect(p!.dias).toBe(1);
  });

  it("etapa fora da negociação não envelhece", () => {
    for (const etapa of ["CONTRATO_FECHADO", "EM_PROVAS", "DEVOLVIDO", "PERDIDO"] as const) {
      const p = leadParado({ etapa, createdAt: "2026-01-01T12:00:00Z", ultimoContatoEm: null }, HOJE);
      expect(p).toBeNull();
    }
    expect(ETAPAS_EM_NEGOCIACAO).not.toContain("CONTRATO_FECHADO");
  });

  it("contato com data futura não vira dias negativos", () => {
    const p = leadParado(
      { etapa: "NOVO", createdAt: "2026-01-01T12:00:00Z", ultimoContatoEm: "2026-07-01T10:00:00-03:00" },
      HOJE,
    );
    expect(p!.dias).toBe(0);
    expect(p!.temperatura).toBe("ok");
  });

  it("as faixas acendem nos limiares, não antes", () => {
    expect(temperaturaDeParado(DIAS_ATENCAO)).toBe("ok");
    expect(temperaturaDeParado(DIAS_ATENCAO + 1)).toBe("atencao");
    expect(temperaturaDeParado(DIAS_CRITICO)).toBe("atencao");
    expect(temperaturaDeParado(DIAS_CRITICO + 1)).toBe("critico");
  });
});
