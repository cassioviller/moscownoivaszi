import { describe, expect, it } from "vitest";
import {
  transicaoLeadValida,
  avancarEtapaLead,
  transicaoOrcamentoValida,
  transicaoReservaValida,
} from "../lib/estados";

describe("Lote 6 — máquina de estados (pura)", () => {
  describe("lead", () => {
    it("permite avançar no funil e o no-op", () => {
      expect(transicaoLeadValida("NOVO", "ATENDIMENTO_AGENDADO")).toBe(true);
      expect(transicaoLeadValida("ORCAMENTO_ABERTO", "CONTRATO_FECHADO")).toBe(true);
      expect(transicaoLeadValida("NOVO", "NOVO")).toBe(true);
    });

    it("recusa regressão no funil", () => {
      expect(transicaoLeadValida("CONTRATO_FECHADO", "ORCAMENTO_ABERTO")).toBe(false);
      expect(transicaoLeadValida("EM_ATENDIMENTO", "NOVO")).toBe(false);
    });

    it("sempre pode marcar PERDIDO e revive de PERDIDO", () => {
      expect(transicaoLeadValida("EM_ATENDIMENTO", "PERDIDO")).toBe(true);
      expect(transicaoLeadValida("PERDIDO", "NOVO")).toBe(true);
      expect(transicaoLeadValida("PERDIDO", "PERDIDO")).toBe(true);
    });

    it("avancarEtapaLead nunca regride nem mexe em PERDIDO", () => {
      expect(avancarEtapaLead("NOVO", "ORCAMENTO_ABERTO")).toBe("ORCAMENTO_ABERTO");
      expect(avancarEtapaLead("CONTRATO_FECHADO", "ORCAMENTO_ABERTO")).toBe("CONTRATO_FECHADO");
      expect(avancarEtapaLead("PERDIDO", "CONTRATO_FECHADO")).toBe("PERDIDO");
    });
  });

  describe("orçamento", () => {
    it("aprova/recusa a partir de RASCUNHO ou ENVIADO", () => {
      expect(transicaoOrcamentoValida("RASCUNHO", "APROVADO")).toBe(true);
      expect(transicaoOrcamentoValida("ENVIADO", "RECUSADO")).toBe(true);
    });

    it("estados finais não transitam", () => {
      expect(transicaoOrcamentoValida("APROVADO", "RECUSADO")).toBe(false);
      expect(transicaoOrcamentoValida("RECUSADO", "APROVADO")).toBe(false);
    });
  });

  describe("reserva", () => {
    it("EM_MONTAGEM → CONFIRMADA → CONCLUIDA", () => {
      expect(transicaoReservaValida("EM_MONTAGEM", "CONFIRMADA")).toBe(true);
      expect(transicaoReservaValida("CONFIRMADA", "CONCLUIDA")).toBe(true);
    });

    it("não pula para CONCLUIDA nem sai de estados finais", () => {
      expect(transicaoReservaValida("EM_MONTAGEM", "CONCLUIDA")).toBe(false);
      expect(transicaoReservaValida("CANCELADA", "CONFIRMADA")).toBe(false);
    });
  });
});
