import { describe, expect, it } from "vitest";
import { abertoEmCentavos, reais } from "@workspace/financeiro-core";

/**
 * E125 (D4) — o saldo devedor sai da régua única.
 *
 * A soma "quanto falta pagar" existia escrita três vezes: privada no core
 * (`horizonteAberto`), no diálogo de cancelar do contrato e no portal da
 * noiva. A vendedora, no telefone, não tinha o número em tela nenhuma da
 * loja — a tela do contrato destacava o Valor Total e o rodapé somava o
 * PREVISTO. Este teste prova a conta exportada com o caso do achado.
 */

type P = {
  status: string;
  vencimento: string;
  valorPrevisto: number;
  valorRecebido?: number | null;
};

const parcela = (over: Partial<P>): P => ({
  status: "PREVISTA",
  vencimento: "2027-03-10",
  valorPrevisto: 840,
  ...over,
});

describe("abertoEmCentavos — o 'falta receber' do contrato", () => {
  it("contrato de R$ 8.400,00, entrada e 3 parcelas recebidas: faltam R$ 5.880,00", () => {
    // O caso do D4: entrada (numero 0) + 10 parcelas de 840. Entraram a
    // entrada e 3 parcelas; as 7 abertas somam 7 × 840 = 5.880,00 — as "7
    // somas mentais por ligação" do achado.
    const pagas = Array.from({ length: 4 }, () =>
      parcela({ status: "PAGA", valorRecebido: 840 }),
    );
    const abertas = Array.from({ length: 7 }, () => parcela({}));
    expect(abertoEmCentavos([...pagas, ...abertas])).toBe(588000);
    expect(reais(abertoEmCentavos([...pagas, ...abertas]))).toBe(5880);
  });

  it("a PARCIAL entra pelo saldo, não pelo previsto — cobrar de novo é o erro que a noiva vê primeiro", () => {
    const itens = [
      parcela({ status: "PARCIAL", valorPrevisto: 1000, valorRecebido: 400 }),
      parcela({ valorPrevisto: 500 }),
    ];
    expect(abertoEmCentavos(itens)).toBe(110000); // 600 + 500
  });

  it("CANCELADA e PAGA não devem nada", () => {
    expect(
      abertoEmCentavos([
        parcela({ status: "CANCELADA" }),
        parcela({ status: "PAGA", valorRecebido: 840 }),
      ]),
    ).toBe(0);
  });

  it("contrato quitado responde zero — a resposta do telefone é 'nada'", () => {
    const pagas = Array.from({ length: 10 }, () =>
      parcela({ status: "PAGA", valorRecebido: 840 }),
    );
    expect(abertoEmCentavos(pagas)).toBe(0);
  });
});
