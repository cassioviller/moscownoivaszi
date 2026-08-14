import { describe, expect, it } from "vitest";
import { calcularRescisao } from "@workspace/financeiro-core";

/**
 * E217 — a rescisão calcula (8ª §2º, 11ª, 12ª, 13ª §3º e 18ª).
 *
 * Cada caso é o exemplo numérico que a régua exige (regra do repositório):
 * dinheiro sem exemplo é impressão, não achado.
 */
describe("E217 — a rescisão do contrato", () => {
  it("só a reserva foi paga — 8ª §2º retém tudo, devolve zero", () => {
    const r = calcularRescisao({
      iniciativa: "LOCATARIA",
      itens: [{ descricao: "Vestido", valor: 3000, exclusivaDePrimeiroAluguel: false }],
      valorTotalContrato: 3000,
      totalPagoPlano: 1200,
      reservaPaga: 1200,
      prazoDevolucaoReservaDias: null,
      dataRetirada: null,
      hoje: "2026-08-14",
    });
    expect(r.devolucaoTotal).toBe(0);
    expect(r.retencaoTotal).toBe(1200);
    expect(r.linhas).toEqual([{ descricao: "Reserva", clausula: "8ª §2º", retido: 1200, devolvido: 0 }]);
  });

  it("11ª — pago além da reserva devolve deduzindo 60%: R$ 1.000 pagos a mais → devolve R$ 400", () => {
    const r = calcularRescisao({
      iniciativa: "LOCATARIA",
      itens: [{ descricao: "Vestido", valor: 3000, exclusivaDePrimeiroAluguel: false }],
      valorTotalContrato: 3000,
      totalPagoPlano: 2200,
      reservaPaga: 1200,
      prazoDevolucaoReservaDias: null,
      dataRetirada: null,
      hoje: "2026-08-14",
    });
    expect(r.devolucaoTotal).toBe(400);
    expect(r.retencaoTotal).toBe(1800); // 1200 (reserva) + 600 (60% de 1000)
    // A soma sempre reconcilia com o que entrou.
    expect(r.devolucaoTotal + r.retencaoTotal).toBe(2200);
  });

  it("12ª — a peça exclusiva some da dedução: sua fração do pago vira multa integral, não os 60%", () => {
    const r = calcularRescisao({
      iniciativa: "LOCATARIA",
      itens: [
        { descricao: "Vestido EX-01", valor: 3000, exclusivaDePrimeiroAluguel: true },
        { descricao: "Véu", valor: 500, exclusivaDePrimeiroAluguel: false },
      ],
      valorTotalContrato: 3500,
      totalPagoPlano: 2400,
      reservaPaga: 1400,
      prazoDevolucaoReservaDias: null,
      dataRetirada: null,
      hoje: "2026-08-14",
    });
    // Restante após a reserva: R$ 1.000,00, rateado 3000/3500 exclusivo e
    // 500/3500 comum — R$ 857,14 e R$ 142,86.
    const exclusiva = r.linhas.find((l) => l.clausula === "12ª")!;
    expect(exclusiva.retido).toBe(857.14);
    expect(exclusiva.devolvido).toBe(0);
    const comum = r.linhas.find((l) => l.clausula === "11ª")!;
    expect(comum.devolvido).toBe(57.14); // 40% de 142,86
    expect(comum.retido).toBe(85.72); // 60% de 142,86
    expect(r.devolucaoTotal).toBe(57.14);
    // Centavo a centavo: reserva + multa exclusiva + multa comum + devolvido = pago.
    expect(
      r.linhas.reduce((s, l) => s + Math.round(l.retido * 100) + Math.round(l.devolvido * 100), 0),
    ).toBe(240000);
  });

  it("18ª — pago o total, cancela com antecedência pactuada: devolve sem os 60%", () => {
    const r = calcularRescisao({
      iniciativa: "LOCATARIA",
      itens: [{ descricao: "Vestido", valor: 3000, exclusivaDePrimeiroAluguel: false }],
      valorTotalContrato: 3000,
      totalPagoPlano: 3000,
      reservaPaga: 1200,
      prazoDevolucaoReservaDias: 30,
      dataRetirada: "2026-12-01T14:00:00-03:00",
      hoje: "2026-10-01",
    });
    expect(r.aplicou18a).toBe(true);
    expect(r.devolucaoTotal).toBe(1800); // 3000 - 1200, sem dedução
    expect(r.retencaoTotal).toBe(1200); // só a reserva
  });

  it("18ª não dispara fora do prazo pactuado — cai na 11ª, com a multa de 60%", () => {
    const r = calcularRescisao({
      iniciativa: "LOCATARIA",
      itens: [{ descricao: "Vestido", valor: 3000, exclusivaDePrimeiroAluguel: false }],
      valorTotalContrato: 3000,
      totalPagoPlano: 3000,
      reservaPaga: 1200,
      prazoDevolucaoReservaDias: 30,
      dataRetirada: "2026-12-01T14:00:00-03:00",
      hoje: "2026-11-15", // depois do limite (2026-11-01)
    });
    expect(r.aplicou18a).toBe(false);
    expect(r.devolucaoTotal).toBe(720); // 40% de 1800
  });

  it("18ª não dispara sem o prazo pactuado (D3 vazio) — o sistema não inventa prazo que ninguém acordou", () => {
    const r = calcularRescisao({
      iniciativa: "LOCATARIA",
      itens: [{ descricao: "Vestido", valor: 3000, exclusivaDePrimeiroAluguel: false }],
      valorTotalContrato: 3000,
      totalPagoPlano: 3000,
      reservaPaga: 1200,
      prazoDevolucaoReservaDias: null,
      dataRetirada: "2026-12-01T14:00:00-03:00",
      hoje: "2026-10-01",
    });
    expect(r.aplicou18a).toBe(false);
  });

  it("13ª — a loja cancela e devolve tudo, reserva incluída", () => {
    const r = calcularRescisao({
      iniciativa: "LOJA",
      itens: [{ descricao: "Vestido", valor: 3000, exclusivaDePrimeiroAluguel: false }],
      valorTotalContrato: 3000,
      totalPagoPlano: 2400,
      reservaPaga: 1200,
      prazoDevolucaoReservaDias: null,
      dataRetirada: null,
      hoje: "2026-08-14",
    });
    expect(r.devolucaoTotal).toBe(2400);
    expect(r.retencaoTotal).toBe(0);
  });

  it("nada foi pago — nada a reter, nada a devolver, e a linha não nasce vazia", () => {
    const r = calcularRescisao({
      iniciativa: "LOCATARIA",
      itens: [{ descricao: "Vestido", valor: 3000, exclusivaDePrimeiroAluguel: false }],
      valorTotalContrato: 3000,
      totalPagoPlano: 0,
      reservaPaga: 0,
      prazoDevolucaoReservaDias: null,
      dataRetirada: null,
      hoje: "2026-08-14",
    });
    expect(r.linhas).toEqual([]);
    expect(r.devolucaoTotal).toBe(0);
    expect(r.retencaoTotal).toBe(0);
  });
});
