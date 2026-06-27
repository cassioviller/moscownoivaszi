import { describe, it, expect } from "vitest";
import { estagioDaNoiva, noivaAtiva, type FatosJornada } from "@/lib/leads/jornada";

const ZERO: FatosJornada = {
  houveAtendimento: false, foiAtendida: false,
  temProvaAgendada: false, temInteresse: false, temOrcamento: false, orcamentoAbertoEm: null,
  temContrato: false, contratoFechadoEm: null, temProvaRealizada: false, temRetirada: false,
  casamentoPassou: false, temDevolucao: false, perdidaEm: null,
};
const d = new Date("2026-06-01T00:00:00.000Z");

describe("estagioDaNoiva — maior índice satisfeito", () => {
  it("só cadastrada", () => {
    const r = estagioDaNoiva(ZERO);
    expect(r.atual).toBe("cadastrada");
    expect(r.encerrada).toBeNull();
    expect(r.passos[0].estado).toBe("atual");
    expect(r.passos[1].estado).toBe("futuro");
  });
  it("houve atendimento (agendado/faltou) → atendimento_agendado (sticky)", () => {
    expect(estagioDaNoiva({ ...ZERO, houveAtendimento: true }).atual).toBe("atendimento_agendado");
  });
  it("foi atendida → atendida (anteriores = feito)", () => {
    const r = estagioDaNoiva({ ...ZERO, foiAtendida: true });
    expect(r.atual).toBe("atendida");
    expect(r.passos.find((p) => p.chave === "atendimento_agendado")!.estado).toBe("feito");
  });
  it("prova agendada → prova_marcada", () => {
    expect(estagioDaNoiva({ ...ZERO, temProvaAgendada: true }).atual).toBe("prova_marcada");
  });
  it("interesse → interesses", () => {
    expect(estagioDaNoiva({ ...ZERO, temInteresse: true }).atual).toBe("interesses");
  });
  it("orçamento aberto → orcamento_aberto (marco legado OU orçamento real)", () => {
    expect(estagioDaNoiva({ ...ZERO, orcamentoAbertoEm: d }).atual).toBe("orcamento_aberto");
    expect(estagioDaNoiva({ ...ZERO, temOrcamento: true }).atual).toBe("orcamento_aberto");
  });
  it("contrato fechado → contrato_fechado (contrato ativo OU marco legado)", () => {
    expect(estagioDaNoiva({ ...ZERO, contratoFechadoEm: d }).atual).toBe("contrato_fechado");
    expect(estagioDaNoiva({ ...ZERO, temContrato: true }).atual).toBe("contrato_fechado");
  });
  it("prova realizada (sem marcos) → em_provas, anteriores = feito", () => {
    const r = estagioDaNoiva({ ...ZERO, temProvaRealizada: true });
    expect(r.atual).toBe("em_provas");
    expect(r.passos.find((p) => p.chave === "orcamento_aberto")!.estado).toBe("feito");
  });
  it("retirada → retirado", () => {
    expect(estagioDaNoiva({ ...ZERO, temRetirada: true }).atual).toBe("retirado");
  });
  it("casamento passou → casamento (não encerra como 'Devolvido')", () => {
    const r = estagioDaNoiva({ ...ZERO, casamentoPassou: true });
    expect(r.atual).toBe("casamento");
    expect(r.encerrada).toBeNull();
  });
  it("devolução → devolucao + encerrada 'Devolvido'", () => {
    const r = estagioDaNoiva({ ...ZERO, temDevolucao: true });
    expect(r.atual).toBe("devolucao");
    expect(r.encerrada).toBe("Devolvido");
  });
  it("perdida sobrepõe: mantém o atual e encerra como 'Perdida'", () => {
    const r = estagioDaNoiva({ ...ZERO, temInteresse: true, perdidaEm: d });
    expect(r.atual).toBe("interesses");
    expect(r.encerrada).toBe("Perdida");
  });
});

describe("noivaAtiva", () => {
  it("ativa em etapas vivas", () => {
    expect(noivaAtiva("interesses", null)).toBe(true);
  });
  it("inativa: casamento, devolução, perdida", () => {
    expect(noivaAtiva("casamento", null)).toBe(false);
    expect(noivaAtiva("devolucao", "Devolvido")).toBe(false);
    expect(noivaAtiva("interesses", "Perdida")).toBe(false);
  });
});
