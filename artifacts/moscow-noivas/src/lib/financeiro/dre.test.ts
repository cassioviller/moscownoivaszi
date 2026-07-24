import { describe, expect, it } from "vitest";
import type { Parcela, Pagamento, PagamentoItem, ContaPagar } from "@workspace/api-client-react";
import { dreDoIntervalo, rotuloCategoria } from "@workspace/financeiro-core";

const MARCO = { iniYMD: "2027-03-01", fimYMD: "2027-03-31" };

function conta(over: Partial<ContaPagar> = {}): ContaPagar {
  return {
    id: "ct1",
    lojaId: "loja",
    tipo: "DESPESA",
    descricao: "Conta",
    valorPrevisto: 100,
    vencimento: "2027-03-05T15:00:00.000Z",
    status: "PAGA",
    ...over,
  } as ContaPagar;
}

function item(valor: number, contaPagar?: ContaPagar): PagamentoItem {
  return { id: `i${valor}`, lojaId: "loja", pagamentoId: "pg1", contaPagarId: contaPagar?.id ?? "ct1", valor, contaPagar };
}

function pagamento(itens: PagamentoItem[], over: Partial<Pagamento> = {}): Pagamento {
  return {
    id: "pg1",
    lojaId: "loja",
    data: new Date("2027-03-12T10:00:00-03:00").toISOString(),
    valorPago: itens.reduce((s, i) => s + i.valor, 0),
    itens,
    ...over,
  } as Pagamento;
}

function recebida(valor: number, recebidoEm = new Date("2027-03-10T10:00:00-03:00").toISOString()): Parcela {
  return {
    id: `p${valor}`,
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: valor,
    vencimento: "2027-03-10T15:00:00.000Z",
    status: "PAGA",
    valorRecebido: valor,
    recebidoEm,
  } as Parcela;
}

describe("rotuloCategoria", () => {
  it("prefere a categoria livre", () => {
    expect(rotuloCategoria("Aluguel", "DESPESA")).toBe("Aluguel");
  });

  it("cai no rótulo do tipo quando a categoria é vazia ou só espaços", () => {
    expect(rotuloCategoria(null, "SALARIO")).toBe("Salários");
    expect(rotuloCategoria("   ", "COMISSAO")).toBe("Comissões");
    expect(rotuloCategoria(undefined, "FORNECEDOR")).toBe("Fornecedores");
  });
});

describe("dreDoIntervalo", () => {
  it("resultado é receitas − despesas e as linhas vêm da maior para a menor", () => {
    const pg = pagamento([
      item(300, conta({ id: "a", categoria: "Aluguel" })),
      item(800, conta({ id: "b", categoria: "Fornecedor X", tipo: "FORNECEDOR" })),
    ]);
    const dre = dreDoIntervalo([recebida(2000)], [pg], MARCO);
    expect(dre.receitas).toBe(2000);
    expect(dre.despesas).toEqual([
      { rotulo: "Fornecedor X", total: 800 },
      { rotulo: "Aluguel", total: 300 },
    ]);
    expect(dre.totalDespesas).toBe(1100);
    expect(dre.resultado).toBe(900);
  });

  it("resultado negativo quando gasta mais do que entra", () => {
    const dre = dreDoIntervalo([recebida(100)], [pagamento([item(500, conta())])], MARCO);
    expect(dre.resultado).toBe(-400);
  });

  it("soma categorias iguais vindas de contas diferentes", () => {
    const pg = pagamento([
      item(100, conta({ id: "a", categoria: "Luz" })),
      item(50, conta({ id: "b", categoria: "Luz" })),
    ]);
    expect(dreDoIntervalo([], [pg], MARCO).despesas).toEqual([{ rotulo: "Luz", total: 150 }]);
  });

  it("despesa sem categoria agrupa pelo rótulo do tipo", () => {
    const pg = pagamento([
      item(100, conta({ id: "a", tipo: "SALARIO", categoria: null })),
      item(70, conta({ id: "b", tipo: "SALARIO", categoria: null })),
    ]);
    expect(dreDoIntervalo([], [pg], MARCO).despesas).toEqual([{ rotulo: "Salários", total: 170 }]);
  });

  it("ignora movimento fora do intervalo", () => {
    const abril = pagamento([item(999, conta())], { data: new Date("2027-04-02T10:00:00-03:00").toISOString() });
    const dre = dreDoIntervalo([recebida(100)], [abril], MARCO);
    expect(dre.totalDespesas).toBe(0);
    expect(dre.resultado).toBe(100);
  });

  it("o DRE fecha com o fluxo: total de despesas = soma das saídas do caixa", () => {
    // O invariante que o rateio do backend garante — se divergirem, um dos dois
    // números está mentindo para a dona da loja.
    const pg = pagamento([item(400, conta({ id: "a" })), item(150, conta({ id: "b" }))]);
    const dre = dreDoIntervalo([], [pg], MARCO);
    expect(dre.totalDespesas).toBe(pg.valorPago);
  });
});
