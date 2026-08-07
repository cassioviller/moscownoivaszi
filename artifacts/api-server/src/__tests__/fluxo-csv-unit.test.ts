import { describe, expect, it } from "vitest";
import { resumoCaixa } from "@workspace/financeiro-core";
import {
  linhasCsvFluxo,
  movimentosDoFluxo,
  type PagamentoDoFluxo,
  type ParcelaDoFluxo,
} from "../lib/fluxo";

/**
 * S21/F34 — o pacote da contabilidade, provado sem banco: a montagem dos
 * movimentos e as linhas do CSV são funções puras (lib/fluxo.ts), e é isso que
 * garante que a rota do fluxo e o export não POSSAM divergir — os dois chamam
 * exatamente o que este arquivo prova.
 */

const INTERVALO = { iniYMD: "2026-07-01", fimYMD: "2026-07-31" };

const parcela = (over: Partial<ParcelaDoFluxo> = {}): ParcelaDoFluxo => ({
  id: "p1",
  numero: 1,
  status: "PAGA",
  recebidoEm: "2026-07-10T14:00:00.000Z",
  valorRecebido: 500,
  descricao: null,
  contratoId: "c1",
  contrato: { lead: { noivaNome: "Helena" } },
  ...over,
});

const pagamento = (over: Partial<PagamentoDoFluxo> = {}): PagamentoDoFluxo => ({
  id: "g1",
  data: "2026-07-11T14:00:00.000Z",
  valorPago: 200,
  colaborador: null,
  itens: [{ contaPagar: { descricao: "Aluguel", fornecedor: "Imobiliária", categoria: "FIXA" } }],
  ...over,
});

describe("movimentosDoFluxo — a linha do tempo que a rota e o export compartilham", () => {
  it("entrada e saída saem com a voz da tela, mais recente primeiro", () => {
    const movs = movimentosDoFluxo([parcela()], [pagamento()], INTERVALO);
    expect(movs.map((m) => m.id)).toEqual(["pagamento-g1", "parcela-p1"]);
    expect(movs[1]).toMatchObject({
      tipo: "ENTRADA",
      valor: 500,
      descricao: "Parcela 1",
      rotulo: "Helena",
      contratoId: "c1",
    });
    expect(movs[0]).toMatchObject({ tipo: "SAIDA", valor: 200, descricao: "Aluguel" });
  });

  it("a parcela 0 é 'Entrada/sinal', e descrição própria vence o número", () => {
    const movs = movimentosDoFluxo(
      [parcela({ id: "a", numero: 0 }), parcela({ id: "b", descricao: "Ajuste do véu" })],
      [],
      INTERVALO,
    );
    expect(movs.map((m) => m.descricao).sort()).toEqual(["Ajuste do véu", "Entrada/sinal"]);
  });

  it("o rótulo da saída cai em cascata: colaborador, fornecedor, categoria, nada", () => {
    const so = (over: Partial<PagamentoDoFluxo>) =>
      movimentosDoFluxo([], [pagamento(over)], INTERVALO)[0]!.rotulo;
    expect(so({ colaborador: { nome: "Vera" } })).toBe("Vera");
    expect(so({})).toBe("Imobiliária");
    expect(so({ itens: [{ contaPagar: { descricao: "Luz", fornecedor: null, categoria: "FIXA" } }] })).toBe("FIXA");
    expect(so({ itens: [] })).toBeNull();
  });

  it("o recorte é o dia LOCAL da loja: 02h UTC de 01/07 ainda é 30/06 em SP", () => {
    // A mesma régua da rota do fluxo (instanteNoIntervalo, via core): recortar
    // em UTC incluiria este recebimento no pacote de julho — e ele é de junho.
    const movs = movimentosDoFluxo(
      [parcela({ recebidoEm: "2026-07-01T02:00:00.000Z" })],
      [],
      INTERVALO,
    );
    expect(movs).toEqual([]);
  });
});

describe("linhasCsvFluxo — o CSV fecha com a tela por construção", () => {
  const parcelas = [parcela()];
  const pagamentos = [pagamento()];
  const movs = movimentosDoFluxo(parcelas, pagamentos, INTERVALO);
  const resumo = resumoCaixa(parcelas, pagamentos, INTERVALO);
  const linhas = linhasCsvFluxo(movs, resumo);

  it("um movimento por linha: dia da contadora, saída negativa, quem na coluna", () => {
    expect(linhas[0]).toEqual(["Data", "Tipo", "Descrição", "Quem", "Valor"]);
    expect(linhas[1]).toEqual(["11/07/2026", "Saída", "Aluguel", "Imobiliária", "-200.00"]);
    expect(linhas[2]).toEqual(["10/07/2026", "Entrada", "Parcela 1", "Helena", "500.00"]);
  });

  it("o rodapé traz o resumo do período — os MESMOS totais da tela", () => {
    expect(linhas.slice(-3)).toEqual([
      ["", "", "Entradas", "", "500.00"],
      ["", "", "Saídas", "", "-200.00"],
      ["", "", "Saldo do período", "", "300.00"],
    ]);
  });

  it("as linhas somam o que o rodapé afirma — mesma entrada, mesma conta", () => {
    const soma = linhas
      .slice(1, -3)
      .reduce((s, l) => s + Number(l[4]), 0);
    expect(soma.toFixed(2)).toBe(resumo.saldo.toFixed(2));
  });
});
