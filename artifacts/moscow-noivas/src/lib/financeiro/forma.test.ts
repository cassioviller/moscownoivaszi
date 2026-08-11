import { describe, expect, it } from "vitest";
import type { Parcela } from "@workspace/api-client-react";
import {
  FORMAS,
  estaAberta,
  estaAtrasada,
  motivoNaoRemove,
  podeRemoverParcela,
  rotuloForma,
  vencidas,
} from "./forma";

const HOJE = "2027-07-16";
const negocio = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toISOString();

function parcela(dia: string, valor: number, status: Parcela["status"] = "PREVISTA"): Parcela {
  return {
    id: `p-${dia}`,
    lojaId: "loja",
    contratoId: "c1",
    numero: 1,
    valorPrevisto: valor,
    vencimento: negocio(dia),
    status,
  } as Parcela;
}

describe("rotuloForma", () => {
  it("traduz as formas do enum", () => {
    expect(rotuloForma("PIX")).toBe("Pix");
    expect(rotuloForma("CARTAO_CREDITO")).toBe("Cartão de crédito");
  });

  it("cobre todo o enum gerado — nenhuma forma fica sem rótulo", () => {
    for (const f of FORMAS) expect(rotuloForma(f)).toBeTruthy();
    expect(FORMAS).toHaveLength(7);
  });

  it("ausente vira null; valor fora do enum sobrevive como está", () => {
    expect(rotuloForma(null)).toBeNull();
    expect(rotuloForma(undefined)).toBeNull();
    expect(rotuloForma("")).toBeNull();
    expect(rotuloForma("CRIPTO")).toBe("CRIPTO");
  });
});

describe("estaAtrasada", () => {
  it("prevista e vencida = atrasada", () => {
    expect(estaAtrasada(parcela("2027-07-15", 100), HOJE)).toBe(true);
  });

  it("vencendo hoje ainda não é atraso", () => {
    expect(estaAtrasada(parcela(HOJE, 100), HOJE)).toBe(false);
  });

  it("liquidada nunca é atraso, por mais velha que seja", () => {
    expect(estaAtrasada(parcela("2020-01-01", 100, "PAGA"), HOJE)).toBe(false);
    expect(estaAtrasada(parcela("2020-01-01", 100, "CANCELADA"), HOJE)).toBe(false);
  });
});

describe("vencidas", () => {
  it("conta e soma só o que está em aberto e vencido", () => {
    expect(
      vencidas(
        [
          parcela("2027-07-10", 100),
          parcela("2027-07-14", 50.5),
          parcela(HOJE, 999), // vence hoje
          parcela("2027-08-01", 999), // futuro
          parcela("2027-01-01", 999, "PAGA"), // liquidada
        ],
        HOJE,
      ),
    ).toEqual({ qtd: 2, total: 150.5 });
  });

  it("lista vazia devolve zero, não NaN", () => {
    expect(vencidas([], HOJE)).toEqual({ qtd: 0, total: 0 });
  });
});

/**
 * P6 (E169) — "aberta" decide quem se RECEBE; quem se REMOVE é outra pergunta.
 *
 * A tela de contrato oferecia "Remover" para PREVISTA e PARCIAL (`estaAberta`),
 * e o servidor só aceita PREVISTA: a recusa dele, traduzida, dizia *"Só
 * parcelas em aberto podem ser removidas"* **sobre uma parcela em aberto** —
 * contradição literal, sem gesto possível.
 */
describe("podeRemoverParcela — a régua do servidor, não a de estar aberta", () => {
  it("PREVISTA sai do plano; PARCIAL não, porque já tem dinheiro dentro", () => {
    expect(podeRemoverParcela({ status: "PREVISTA" })).toBe(true);
    expect(podeRemoverParcela({ status: "PARCIAL" })).toBe(false);
    expect(podeRemoverParcela({ status: "PAGA" })).toBe(false);
    expect(podeRemoverParcela({ status: "CANCELADA" })).toBe(false);
  });

  it("as duas continuam ABERTAS — é justamente por isso que a frase antiga mentia", () => {
    expect(estaAberta({ status: "PREVISTA" })).toBe(true);
    expect(estaAberta({ status: "PARCIAL" })).toBe(true);
  });

  it("em PARCIAL o motivo diz o gesto que existe: estornar antes", () => {
    expect(motivoNaoRemove({ status: "PARCIAL" })).toContain("Estorne");
    expect(motivoNaoRemove({ status: "PREVISTA" })).toBeNull();
  });
});
