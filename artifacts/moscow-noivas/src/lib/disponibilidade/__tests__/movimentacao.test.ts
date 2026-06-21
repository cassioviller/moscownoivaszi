// Máquina de estados da movimentação (retirada ↔ devolução) — pura, sem banco.
import { describe, it, expect } from "vitest";
import { resolverMovimentacao, type EstadoMovimentacao } from "../movimentacao";

const VAZIO: EstadoMovimentacao = { retirada: null, devolucao: null };

describe("resolverMovimentacao", () => {
  it("grava a retirada a partir do vazio", () => {
    expect(resolverMovimentacao(VAZIO, { retiradaDataReal: "2027-06-01" })).toEqual({
      ok: true,
      estado: { retirada: "2027-06-01", devolucao: null },
    });
  });

  it("grava a devolução quando já há retirada", () => {
    const atual = { retirada: "2027-06-01", devolucao: null };
    expect(resolverMovimentacao(atual, { devolucaoDataReal: "2027-06-10" })).toEqual({
      ok: true,
      estado: { retirada: "2027-06-01", devolucao: "2027-06-10" },
    });
  });

  it("campo ausente mantém o valor atual", () => {
    const atual = { retirada: "2027-06-01", devolucao: "2027-06-10" };
    expect(resolverMovimentacao(atual, {})).toEqual({ ok: true, estado: atual });
  });

  it("null limpa o campo", () => {
    const atual = { retirada: "2027-06-01", devolucao: null };
    expect(resolverMovimentacao(atual, { retiradaDataReal: null })).toEqual({
      ok: true,
      estado: { retirada: null, devolucao: null },
    });
  });

  it("recusa devolução sem retirada", () => {
    expect(resolverMovimentacao(VAZIO, { devolucaoDataReal: "2027-06-10" })).toMatchObject({ ok: false, motivo: "sem_retirada" });
  });

  it("recusa limpar a retirada deixando a devolução órfã", () => {
    const atual = { retirada: "2027-06-01", devolucao: "2027-06-10" };
    expect(resolverMovimentacao(atual, { retiradaDataReal: null })).toMatchObject({ ok: false, motivo: "devolucao_orfa" });
  });

  it("recusa devolução anterior à retirada", () => {
    const atual = { retirada: "2027-06-10", devolucao: null };
    expect(resolverMovimentacao(atual, { devolucaoDataReal: "2027-06-01" })).toMatchObject({ ok: false, motivo: "data_invertida" });
  });

  it("devolução igual à retirada é válida (mesmo dia)", () => {
    const atual = { retirada: "2027-06-10", devolucao: null };
    expect(resolverMovimentacao(atual, { devolucaoDataReal: "2027-06-10" })).toMatchObject({ ok: true });
  });

  it("string vazia do form é data_invalida (não confundir com limpar)", () => {
    expect(resolverMovimentacao(VAZIO, { retiradaDataReal: "" })).toMatchObject({ ok: false, motivo: "data_invalida" });
  });

  it("dia inexistente é data_invalida", () => {
    expect(resolverMovimentacao(VAZIO, { retiradaDataReal: "2027-02-30" })).toMatchObject({ ok: false, motivo: "data_invalida" });
  });
});
