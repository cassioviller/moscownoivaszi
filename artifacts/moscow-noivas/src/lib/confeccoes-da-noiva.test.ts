import { describe, expect, it } from "vitest";
import { confeccoesDaNoiva, type TrabalhoDaFila } from "./confeccoes-da-noiva";

/**
 * E155 — o que o seletor "Da fila da costureira" pode oferecer.
 *
 * As duas condições existem por motivos diferentes: o tipo evita cobrar duas
 * vezes o que já está no aluguel; a noiva evita oferecer o que o servidor vai
 * recusar (404) na frente da cliente.
 */
const fila: TrabalhoDaFila[] = [
  { id: "conf-ana", tipo: "CONFECCAO", descricao: "Manga renda", custo: 450, atendimento: { leadId: "ana" } },
  { id: "conf-bia", tipo: "CONFECCAO", descricao: "Saia lisa", custo: 300, atendimento: { leadId: "bia" } },
  { id: "aj-ana", tipo: "AJUSTE", descricao: "Bainha 3cm", custo: null, atendimento: { leadId: "ana" } },
  { id: "orfao", tipo: "CONFECCAO", descricao: "Sem atendimento", atendimento: null },
];

describe("E155 — as confecções que este orçamento pode cobrar", () => {
  it("só as CONFECÇÕES desta noiva", () => {
    expect(confeccoesDaNoiva(fila, "ana").map((t) => t.id)).toEqual(["conf-ana"]);
  });

  it("o ajuste comum fica de fora — ele já está no aluguel", () => {
    expect(confeccoesDaNoiva(fila, "ana").some((t) => t.id === "aj-ana")).toBe(false);
  });

  it("a confecção de outra noiva nunca é oferecida", () => {
    expect(confeccoesDaNoiva(fila, "bia").map((t) => t.id)).toEqual(["conf-bia"]);
  });

  it("orçamento sem noiva não oferece nada", () => {
    expect(confeccoesDaNoiva(fila, null)).toEqual([]);
    expect(confeccoesDaNoiva(fila, undefined)).toEqual([]);
  });

  it("noiva sem confecção nenhuma devolve lista vazia — o seletor some", () => {
    expect(confeccoesDaNoiva(fila, "carla")).toEqual([]);
  });
});
