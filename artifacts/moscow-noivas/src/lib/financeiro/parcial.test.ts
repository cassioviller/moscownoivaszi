import { describe, expect, it } from "vitest";
import type { Parcela } from "@workspace/api-client-react";
import {
  estaAberta,
  estaAtrasada,
  saldoAberto,
  teveRecebimento,
  vencidas,
} from "@workspace/financeiro-core";
import { horizonteAberto, resumoCaixa } from "./fluxo";
import { projetarCaixa } from "./projecao";
import { agingDeParcelas } from "./cobranca";

/**
 * E49 — a parcela meio paga. O ponto do épico é que ela precisa aparecer nos
 * DOIS lados ao mesmo tempo: o que entrou no caixa realizado e o que falta no
 * aberto/aging/projeção. Antes o status era binário, então ou ela sumia do "a
 * receber" com dinheiro faltando, ou ficava 100% aberta com o dinheiro que
 * entrou invisível.
 */

const HOJE = "2027-03-15";
const INTERVALO = { iniYMD: "2027-03-01", fimYMD: "2027-03-31" };

/** Parcela de 1000 com 400 já recebidos: falta 600. */
function meioPaga(over: Partial<Parcela> = {}): Parcela {
  return {
    id: "p-parcial",
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: 1000,
    vencimento: new Date("2027-03-10T12:00:00-03:00").toISOString(),
    status: "PARCIAL",
    valorRecebido: 400,
    recebidoEm: new Date("2027-03-05T14:00:00-03:00").toISOString(),
    contrato: { leadId: "lead-1", lead: { noivaNome: "Ana", whatsapp: "11988887777" } },
    ...over,
  } as Parcela;
}

describe("as duas réguas", () => {
  it("PARCIAL está aberta E teve recebimento — as duas coisas", () => {
    const p = meioPaga();
    expect(estaAberta(p)).toBe(true);
    expect(teveRecebimento(p)).toBe(true);
  });

  it("o saldo é o que falta, e nunca é negativo", () => {
    expect(saldoAberto(meioPaga())).toBe(600);
    // Recebeu mais do que devia (acerto manual no banco, arredondamento):
    // o excedente não vira crédito nem polui os totais com número negativo.
    expect(saldoAberto(meioPaga({ valorRecebido: 1200 }))).toBe(0);
    // Parcela intocada deve tudo.
    expect(saldoAberto(meioPaga({ status: "PREVISTA", valorRecebido: null }))).toBe(1000);
  });

  it("PAGA e CANCELADA não estão abertas", () => {
    expect(estaAberta(meioPaga({ status: "PAGA" }))).toBe(false);
    expect(estaAberta(meioPaga({ status: "CANCELADA" }))).toBe(false);
  });
});

describe("a parcela meio paga aparece dos dois lados", () => {
  it("o que entrou conta no caixa realizado", () => {
    const r = resumoCaixa([meioPaga()], [], INTERVALO);
    // 400 entraram de verdade — não 1000 (que não entrou) nem 0 (que ignoraria
    // dinheiro que está no caixa).
    expect(r.entradas).toBe(400);
  });

  it("o que falta continua no horizonte aberto", () => {
    const h = horizonteAberto([meioPaga()], [], HOJE);
    expect(h.aReceber).toBe(600);
    // Venceu em 10/03 e hoje é 15/03: o resto está atrasado.
    expect(h.aReceberAtraso).toBe(600);
  });

  it("está atrasada, e o vencido é o saldo", () => {
    const p = meioPaga();
    expect(estaAtrasada(p, HOJE)).toBe(true);
    expect(vencidas([p], HOJE)).toEqual({ qtd: 1, total: 600 });
  });

  it("a projeção conta só o que falta entrar", () => {
    // Vencimento no futuro para cair na curva, não no atraso.
    const futura = meioPaga({ vencimento: new Date("2027-03-25T12:00:00-03:00").toISOString() });
    const proj = projetarCaixa([futura], [], { saldoInicial: 0, horizonteDias: 30, hoje: HOJE });
    expect(proj.curva.linhas).toHaveLength(1);
    // 600, não 1000: projetar o previsto cheio nasceria a curva acima do real.
    expect(proj.curva.linhas[0].entradas).toBe(600);
  });

  it("o aging cobra o resto, não a parcela inteira", () => {
    const aging = agingDeParcelas([meioPaga()], HOJE);
    expect(aging.noivas).toHaveLength(1);
    expect(aging.noivas[0].totalVencido).toBe(600);
    // Some da fila só quando quitar — perdoar a diferença em silêncio seria pior.
    expect(agingDeParcelas([meioPaga({ status: "PAGA", valorRecebido: 1000 })], HOJE).noivas)
      .toHaveLength(0);
  });
});
