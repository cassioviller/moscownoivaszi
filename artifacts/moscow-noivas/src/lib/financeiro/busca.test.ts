import { describe, expect, it } from "vitest";
import { casaComBusca, recorteDaConsulta } from "./busca";

/**
 * E124/B4 — a noiva no balcão se acha pelo nome, e a busca derruba a janela.
 *
 * Vermelho-antes (mapeado executando): `receber.tsx` não tinha busca nenhuma —
 * a única forma de achar a parcela de quem está na sua frente era ajustar dois
 * campos de data sabendo o vencimento de cabeça, e a parcela do mês que vem
 * simplesmente não existia na tela (a janela default é o mês corrente).
 */
describe("casaComBusca — o nome do balcão, sem cerimônia", () => {
  it("ignora caixa e acento: 'joao' acha 'João Silva'", () => {
    expect(casaComBusca("João Silva", "joao")).toBe(true);
  });

  it("acha por pedaço: 'mari' acha 'Ana Marina'", () => {
    expect(casaComBusca("Ana Marina", "mari")).toBe(true);
  });

  it("acento na BUSCA também não atrapalha: 'JOÃO' acha 'joao silva'", () => {
    expect(casaComBusca("joao silva", "JOÃO")).toBe(true);
  });

  it("não inventa: 'beatriz' não acha 'Marina'", () => {
    expect(casaComBusca("Marina", "beatriz")).toBe(false);
  });

  it("busca vazia (ou só espaço) não casa nada — vazio não é 'tudo'", () => {
    expect(casaComBusca("Marina", "")).toBe(false);
    expect(casaComBusca("Marina", "   ")).toBe(false);
  });

  it("nome ausente não casa", () => {
    expect(casaComBusca(null, "marina")).toBe(false);
    expect(casaComBusca(undefined, "marina")).toBe(false);
  });
});

describe("recorteDaConsulta — a busca derruba a janela (B4, régua do F29/E98)", () => {
  const janela = { iniYMD: "2026-07-01", fimYMD: "2026-07-31" };

  it("buscando: pede as ABERTAS sem janela — a parcela do mês que vem entra na tela", () => {
    expect(recorteDaConsulta({ buscando: true, semJanela: false, ...janela })).toEqual({
      status: "abertas",
    });
  });

  it("filtro 'atrasadas' continua sem janela, como o F29 já decidiu", () => {
    expect(recorteDaConsulta({ buscando: false, semJanela: true, ...janela })).toEqual({
      status: "abertas",
    });
  });

  it("sem busca e sem 'atrasadas': a janela de vencimento vale", () => {
    expect(recorteDaConsulta({ buscando: false, semJanela: false, ...janela })).toEqual({
      de: "2026-07-01",
      ate: "2026-07-31",
    });
  });
});
