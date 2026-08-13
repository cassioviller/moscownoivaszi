import { describe, expect, it } from "vitest";
import type { Recibo } from "@workspace/api-client-react";
import { recibosPorParcela } from "./recibos-da-parcela";

/**
 * E221 — a cláusula 7ª manda fornecer **todos os recibos de pagamentos
 * efetuados**, e o recibo é do PAGAMENTO. A tela do contrato mostra o carnê
 * linha a linha; esta é a leitura que casa uma lista com a outra.
 */
const recibo = (id: string, parcelaId: string, valor: number, mora = 0): Recibo => ({
  id,
  parcelaId,
  contratoId: "c1",
  parcela: "Entrada",
  valor,
  // S-C50: o que a noiva pagou (`valor`) menos o que a cláusula 9ª levou.
  valorNaParcela: valor - mora,
  mora,
  pagoEm: "2026-03-01T12:00:00.000Z",
  forma: "PIX",
  lancadoPor: "Karina",
  totalRecebido: valor - mora,
  saldoRestante: 0,
});

describe("E221 — os recibos, agrupados pela parcela", () => {
  it("uma parcela recebida em três vezes tem TRÊS recibos, não um", () => {
    const mapa = recibosPorParcela([
      recibo("r1", "p1", 300),
      recibo("r2", "p1", 200),
      recibo("r3", "p1", 500),
    ]);

    expect(mapa.get("p1")).toHaveLength(3);
    expect(mapa.get("p1")!.map((r) => r.valor)).toEqual([300, 200, 500]);
  });

  it("preserva a ordem que a porta mandou — o dia do pagamento", () => {
    const mapa = recibosPorParcela([
      recibo("r1", "p1", 300),
      recibo("r2", "p2", 700),
      recibo("r3", "p1", 700),
    ]);

    expect(mapa.get("p1")!.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(mapa.get("p2")!.map((r) => r.id)).toEqual(["r2"]);
  });

  it("parcela sem recebimento não tem entrada — a tela não desenha seção vazia", () => {
    const mapa = recibosPorParcela([recibo("r1", "p1", 300)]);

    expect(mapa.has("p2")).toBe(false);
    expect(mapa.get("p2")).toBeUndefined();
  });

  it("contrato sem recibo nenhum devolve mapa vazio", () => {
    expect(recibosPorParcela([]).size).toBe(0);
  });

  /**
   * S-C50 — o pagamento de R$ 515,00 numa parcela de R$ 500,00 vencida há 30
   * dias quita DUAS linhas do carnê, e é UM recibo. Ele aparece embaixo da
   * parcela que ele quitou, uma vez; a linha de `MORA` não ganha grupo próprio,
   * porque o dinheiro dela já está neste papel.
   */
  it("o pagamento com multa é UM recibo, embaixo da parcela que ele quitou", () => {
    const mapa = recibosPorParcela([recibo("r1", "p1", 515, 15)]);

    expect(mapa.size).toBe(1);
    expect(mapa.get("p1")).toHaveLength(1);
    expect(mapa.get("p1")![0]).toMatchObject({ valor: 515, valorNaParcela: 500, mora: 15 });
  });
});
