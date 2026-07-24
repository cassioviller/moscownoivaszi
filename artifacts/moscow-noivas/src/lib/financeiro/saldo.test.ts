import { describe, expect, it } from "vitest";
import type { Parcela, Pagamento, SaldoReferencia } from "@workspace/api-client-react";
import { ancoraAtiva, saldoDeHoje, validarConferencia } from "./saldo";

const HOJE = "2027-03-15";
const meioDia = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toISOString();

function saldo(dia: string, valor: number, over: Partial<SaldoReferencia> = {}): SaldoReferencia {
  return { id: `s-${dia}`, lojaId: "loja", dataReferencia: meioDia(dia), valor, ...over } as SaldoReferencia;
}

function recebida(dia: string, valor: number): Parcela {
  return {
    id: `p-${dia}-${valor}`,
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: valor,
    vencimento: meioDia(dia),
    status: "PAGA",
    valorRecebido: valor,
    recebidoEm: new Date(`${dia}T10:00:00-03:00`).toISOString(),
  } as Parcela;
}

function saida(dia: string, valor: number): Pagamento {
  return {
    id: `pg-${dia}-${valor}`,
    lojaId: "loja",
    data: new Date(`${dia}T10:00:00-03:00`).toISOString(),
    valorPago: valor,
    itens: [],
  } as Pagamento;
}

describe("ancoraAtiva", () => {
  it("pega a mais recente que já vale hoje", () => {
    const a = ancoraAtiva([saldo("2027-03-01", 100), saldo("2027-03-10", 200)], HOJE);
    expect(a?.valor).toBe(200);
  });

  it("ignora âncora no futuro — não é o caixa de agora", () => {
    const a = ancoraAtiva([saldo("2027-03-10", 200), saldo("2027-03-20", 999)], HOJE);
    expect(a?.valor).toBe(200);
  });

  it("âncora de hoje vale (o dia já começou)", () => {
    expect(ancoraAtiva([saldo(HOJE, 50)], HOJE)?.valor).toBe(50);
  });

  it("sem âncora aplicável devolve null", () => {
    expect(ancoraAtiva([saldo("2027-04-01", 1)], HOJE)).toBeNull();
    expect(ancoraAtiva([], HOJE)).toBeNull();
    expect(ancoraAtiva(undefined, HOJE)).toBeNull();
  });
});

describe("saldoDeHoje", () => {
  it("rola a âncora para hoje somando o realizado do meio", () => {
    const r = saldoDeHoje(
      [saldo("2027-03-10", 1000)],
      [recebida("2027-03-12", 500)],
      [saida("2027-03-13", 200)],
      HOJE,
    );
    expect(r).toEqual({ valor: 1300, ancoraDia: "2027-03-10", movimentoDesdeAncora: 300 });
  });

  it("o realizado ANTES da âncora não conta — a âncora já o embute", () => {
    // O saldo de 10/03 já reflete o que entrou em 05/03: somar de novo dobraria.
    const r = saldoDeHoje([saldo("2027-03-10", 1000)], [recebida("2027-03-05", 700)], [], HOJE);
    expect(r?.valor).toBe(1000);
  });

  it("o dia da âncora conta: `valor` é o saldo no INÍCIO dele", () => {
    const r = saldoDeHoje([saldo("2027-03-10", 1000)], [recebida("2027-03-10", 400)], [], HOJE);
    expect(r?.valor).toBe(1400);
  });

  it("o movimento de hoje conta — o dia corrente já aconteceu em parte", () => {
    const r = saldoDeHoje([saldo("2027-03-10", 1000)], [recebida(HOJE, 250)], [], HOJE);
    expect(r?.valor).toBe(1250);
  });

  it("o que ainda vai acontecer não conta: é a curva, não o saldo", () => {
    const r = saldoDeHoje([saldo("2027-03-10", 1000)], [recebida("2027-03-20", 900)], [], HOJE);
    expect(r?.valor).toBe(1000);
  });

  it("o saldo pode ficar negativo depois de rolado", () => {
    const r = saldoDeHoje([saldo("2027-03-10", 100)], [], [saida("2027-03-12", 450)], HOJE);
    expect(r?.valor).toBe(-350);
  });

  it("sem âncora é null, não zero — zero é um número, 'não sei' não é", () => {
    expect(saldoDeHoje([], [recebida("2027-03-12", 500)], [], HOJE)).toBeNull();
  });
});

describe("validarConferencia", () => {
  it("aceita hoje com valor em pt-BR", () => {
    expect(validarConferencia(HOJE, "1.234,56", HOJE)).toEqual({ ok: true, valor: 1234.56 });
  });

  it("aceita dia passado", () => {
    expect(validarConferencia("2027-03-10", "100", HOJE)).toEqual({ ok: true, valor: 100 });
  });

  it("recusa dia futuro — ninguém conferiu o caixa de amanhã", () => {
    const r = validarConferencia("2027-03-16", "100", HOJE);
    expect(r.ok).toBe(false);
  });

  it("recusa dia vazio", () => {
    expect(validarConferencia("", "100", HOJE).ok).toBe(false);
  });

  it("recusa valor vazio ou ilegível", () => {
    expect(validarConferencia(HOJE, "", HOJE).ok).toBe(false);
    expect(validarConferencia(HOJE, "abc", HOJE).ok).toBe(false);
  });

  it("zero e negativo são saldos legítimos — o caixa não é obrigado a fechar no azul", () => {
    expect(validarConferencia(HOJE, "0", HOJE)).toEqual({ ok: true, valor: 0 });
    expect(validarConferencia(HOJE, "-350,00", HOJE)).toEqual({ ok: true, valor: -350 });
  });
});
