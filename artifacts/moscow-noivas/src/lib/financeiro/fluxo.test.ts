import { describe, expect, it } from "vitest";
import type { Parcela, Pagamento, ContaPagar } from "@workspace/api-client-react";
import { horizonteAberto, movimentos, resumoCaixa, tendenciaCaixa } from "./fluxo";

const INTERVALO_MARCO = { iniYMD: "2027-03-01", fimYMD: "2027-03-31" };

function parcela(over: Partial<Parcela> = {}): Parcela {
  return {
    id: "p1",
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: 1000,
    vencimento: new Date("2027-03-10T12:00:00-03:00").toISOString(),
    status: "PAGA",
    valorRecebido: 1000,
    recebidoEm: new Date("2027-03-10T14:00:00-03:00").toISOString(),
    ...over,
  } as Parcela;
}

function pagamento(over: Partial<Pagamento> = {}): Pagamento {
  return {
    id: "pg1",
    lojaId: "loja",
    data: new Date("2027-03-12T10:00:00-03:00").toISOString(),
    valorPago: 400,
    itens: [],
    ...over,
  } as Pagamento;
}

describe("resumoCaixa", () => {
  it("soma o realizado e devolve saldo entradas − saídas", () => {
    const r = resumoCaixa([parcela()], [pagamento()], INTERVALO_MARCO);
    expect(r).toEqual({ entradas: 1000, saidas: 400, saldo: 600 });
  });

  it("saldo pode ser negativo", () => {
    const r = resumoCaixa([], [pagamento({ valorPago: 250 })], INTERVALO_MARCO);
    expect(r.saldo).toBe(-250);
  });

  it("ignora parcela PREVISTA — o previsto não é caixa", () => {
    const prevista = parcela({ status: "PREVISTA", valorRecebido: null, recebidoEm: null });
    expect(resumoCaixa([prevista], [], INTERVALO_MARCO).entradas).toBe(0);
  });

  it("conta pelo recebimento, não pelo vencimento", () => {
    // Venceu em fevereiro, foi pago em março: é caixa de março.
    const atrasada = parcela({
      vencimento: new Date("2027-02-10T12:00:00-03:00").toISOString(),
      recebidoEm: new Date("2027-03-05T10:00:00-03:00").toISOString(),
    });
    expect(resumoCaixa([atrasada], [], INTERVALO_MARCO).entradas).toBe(1000);
    expect(resumoCaixa([atrasada], [], { iniYMD: "2027-02-01", fimYMD: "2027-02-28" }).entradas).toBe(0);
  });

  it("recebimento às 23h do último dia do mês fica no mês certo", () => {
    // 23h de 31/03 em SP = 02:00 de 01/04 em UTC. Ler em UTC mudaria o mês
    // de fechamento do caixa.
    const noite = parcela({ recebidoEm: "2027-04-01T02:00:00.000Z" });
    expect(resumoCaixa([noite], [], INTERVALO_MARCO).entradas).toBe(1000);
  });

  it("soma em centavos: valores quebrados não acumulam erro de float", () => {
    const centavos = [0.1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1].map((v, i) =>
      parcela({ id: `p${i}`, valorRecebido: v }),
    );
    expect(resumoCaixa(centavos, [], INTERVALO_MARCO).entradas).toBe(1.1);
  });
});

describe("movimentos", () => {
  it("unifica entradas e saídas, mais recente primeiro", () => {
    const lista = movimentos([parcela()], [pagamento()], INTERVALO_MARCO, { lojaId: "loja" });
    expect(lista.map((m) => m.tipo)).toEqual(["SAIDA", "ENTRADA"]); // 12/03 antes de 10/03
  });

  it("nomeia a parcela pelo número e trata a entrada/sinal", () => {
    const sinal = parcela({ id: "p0", numero: 0, descricao: null });
    const lista = movimentos([sinal], [], INTERVALO_MARCO, { lojaId: "loja" });
    expect(lista[0].descricao).toBe("Entrada/sinal");
    expect(lista[0].href).toBe("/loja/loja/contratos/c1");
  });

  it("descreve a saída pelas contas quitadas e rotula pelo colaborador", () => {
    const pg = pagamento({
      colaborador: { id: "u1", nome: "Ana", email: "a@b.c", ativo: true, isSuperAdmin: false },
      itens: [
        { id: "i1", lojaId: "loja", pagamentoId: "pg1", contaPagarId: "ct1", valor: 300,
          contaPagar: { id: "ct1", lojaId: "loja", tipo: "SALARIO", descricao: "Salário", valorPrevisto: 300, vencimento: "2027-03-05T15:00:00.000Z", status: "PAGA" } },
        { id: "i2", lojaId: "loja", pagamentoId: "pg1", contaPagarId: "ct2", valor: 100,
          contaPagar: { id: "ct2", lojaId: "loja", tipo: "SALARIO", descricao: "Vale", valorPrevisto: 100, vencimento: "2027-03-05T15:00:00.000Z", status: "PAGA" } },
      ],
    } as Partial<Pagamento>);
    const [mov] = movimentos([], [pg], INTERVALO_MARCO, { lojaId: "loja" });
    expect(mov.descricao).toBe("Salário · Vale");
    expect(mov.rotulo).toBe("Ana");
  });

  it("saída sem conta identificada ainda aparece na linha do tempo", () => {
    const [mov] = movimentos([], [pagamento({ itens: [] })], INTERVALO_MARCO, { lojaId: "loja" });
    expect(mov.descricao).toBe("Pagamento");
    expect(mov.rotulo).toBeNull();
  });
});

describe("tendenciaCaixa", () => {
  it("devolve a série contínua, zerando mês sem movimento", () => {
    const p = parcela({ recebidoEm: new Date("2027-03-10T10:00:00-03:00").toISOString() });
    const serie = tendenciaCaixa([p], [], { meses: 3, ate: "2027-03" });
    expect(serie.map((s) => s.competencia)).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(serie.map((s) => s.saldo)).toEqual([0, 0, 1000]);
  });

  it("agrupa o mês pelo dia local do movimento", () => {
    // 22h de 31/03 em SP: é março, não abril.
    const p = parcela({ recebidoEm: "2027-04-01T01:00:00.000Z" });
    const serie = tendenciaCaixa([p], [], { meses: 2, ate: "2027-04" });
    expect(serie).toEqual([
      { competencia: "2027-03", entradas: 1000, saidas: 0, saldo: 1000 },
      { competencia: "2027-04", entradas: 0, saidas: 0, saldo: 0 },
    ]);
  });

  it("limita a janela a 24 meses", () => {
    expect(tendenciaCaixa([], [], { meses: 99, ate: "2027-03" })).toHaveLength(24);
    expect(tendenciaCaixa([], [], { meses: 0, ate: "2027-03" })).toHaveLength(1);
  });
});

describe("horizonteAberto", () => {
  const HOJE = "2027-03-15";
  const vence = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toISOString();
  const conta = (over: Partial<ContaPagar> = {}): ContaPagar =>
    ({
      id: "cp1",
      lojaId: "loja",
      descricao: "Aluguel",
      valorPrevisto: 500,
      vencimento: vence("2027-03-20"),
      status: "PREVISTA",
      tipo: "DESPESA",
      ...over,
    }) as ContaPagar;

  it("soma o que segue previsto, dos dois lados", () => {
    const h = horizonteAberto(
      [parcela({ status: "PREVISTA", valorPrevisto: 1000, vencimento: vence("2027-03-20") })],
      [conta()],
      HOJE,
    );
    expect(h).toEqual({ aReceber: 1000, aReceberAtraso: 0, aPagar: 500, aPagarAtraso: 0 });
  });

  it("o que já virou caixa sai do horizonte — previsto e realizado nunca se somam", () => {
    const h = horizonteAberto(
      [parcela({ status: "PAGA", valorPrevisto: 1000 }), parcela({ id: "p2", status: "CANCELADA", valorPrevisto: 700 })],
      [conta({ status: "PAGA" })],
      HOJE,
    );
    expect(h).toEqual({ aReceber: 0, aReceberAtraso: 0, aPagar: 0, aPagarAtraso: 0 });
  });

  it("atraso é subconjunto do aberto: vencido conta nos dois, a vencer só no aberto", () => {
    const h = horizonteAberto(
      [
        parcela({ id: "atrasada", status: "PREVISTA", valorPrevisto: 300, vencimento: vence("2027-03-10") }),
        parcela({ id: "futura", status: "PREVISTA", valorPrevisto: 200, vencimento: vence("2027-03-30") }),
      ],
      [
        conta({ id: "atrasada", valorPrevisto: 80, vencimento: vence("2027-03-01") }),
        conta({ id: "hoje", valorPrevisto: 20, vencimento: vence(HOJE) }),
      ],
      HOJE,
    );
    // Vencer hoje ainda não é atraso — o dia inteiro é do devedor.
    expect(h).toEqual({ aReceber: 500, aReceberAtraso: 300, aPagar: 100, aPagarAtraso: 80 });
  });

  it("sem nada em aberto devolve zero, não NaN", () => {
    expect(horizonteAberto([], [], HOJE)).toEqual({ aReceber: 0, aReceberAtraso: 0, aPagar: 0, aPagarAtraso: 0 });
  });
});
