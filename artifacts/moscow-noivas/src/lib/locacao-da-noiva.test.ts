import { describe, expect, it } from "vitest";
import { locacaoDaNoiva } from "./locacao-da-noiva";

/**
 * S-C91 — o que a ficha da noiva mostra da locação, e o que ela cala.
 *
 * Os três casos que decidem: o contrato cancelado que ainda tem as datas (a
 * peça já voltou ao mercado), o ativo sem nenhuma das duas (a esmagadora
 * maioria — 733 contratos e 1 com retirada, medido no `heliumdb`) e o ativo
 * pela metade, em que a ficha tem de dizer que falta a outra.
 */

const RETIRADA = "2027-05-12T13:30:00.000Z"; // 12/05/2027 10:30 em São Paulo
const DEVOLUCAO = "2027-05-18T21:00:00.000Z"; // 18/05/2027 18:00 em São Paulo

const ATIVO = {
  id: "c-ativo",
  status: "ATIVO",
  fechadoEm: "2026-07-01T12:00:00.000Z",
  dataRetirada: RETIRADA,
  dataDevolucao: DEVOLUCAO,
};
const CANCELADO_COM_DATAS = {
  id: "c-cancelado",
  status: "CANCELADO",
  fechadoEm: "2026-08-01T12:00:00.000Z",
  dataRetirada: RETIRADA,
  dataDevolucao: DEVOLUCAO,
};

describe("S-C91 — a locação que a ficha da noiva mostra", () => {
  it("é a do contrato ATIVO, com os dois instantes", () => {
    expect(locacaoDaNoiva([CANCELADO_COM_DATAS, ATIVO])).toEqual({
      contratoId: "c-ativo",
      retirada: RETIRADA,
      devolucao: DEVOLUCAO,
    });
  });

  it("contrato CANCELADO não empresta data nenhuma — a peça voltou ao mercado", () => {
    expect(locacaoDaNoiva([CANCELADO_COM_DATAS])).toBeNull();
  });

  it("sem contrato nenhum, não há locação", () => {
    expect(locacaoDaNoiva([])).toBeNull();
    expect(locacaoDaNoiva(undefined)).toBeNull();
  });

  it("ativo sem NENHUMA das duas datas cala — campo vazio não vira linha vazia", () => {
    expect(locacaoDaNoiva([{ ...ATIVO, dataRetirada: null, dataDevolucao: null }])).toBeNull();
    // O contrato antigo, de antes do E222, nem sequer traz as chaves.
    expect(locacaoDaNoiva([{ id: "c", status: "ATIVO", fechadoEm: null }])).toBeNull();
  });

  it("ativo PELA METADE mostra o que tem e diz que falta a outra ponta", () => {
    expect(locacaoDaNoiva([{ ...ATIVO, dataDevolucao: null }])).toEqual({
      contratoId: "c-ativo",
      retirada: RETIRADA,
      devolucao: null,
    });
    expect(locacaoDaNoiva([{ ...ATIVO, dataRetirada: null }])).toEqual({
      contratoId: "c-ativo",
      retirada: null,
      devolucao: DEVOLUCAO,
    });
  });

  it("com dois ativos — o que o índice do E158 proíbe — vale o MAIS RECENTE", () => {
    const novo = { ...ATIVO, id: "c-novo", fechadoEm: "2026-08-10T12:00:00.000Z", dataRetirada: null };
    expect(locacaoDaNoiva([ATIVO, novo])?.contratoId).toBe("c-novo");
    expect(locacaoDaNoiva([novo, ATIVO])?.retirada).toBeNull();
  });
});
