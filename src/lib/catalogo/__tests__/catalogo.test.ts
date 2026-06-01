// src/lib/catalogo/__tests__/catalogo.test.ts
import { describe, it, expect } from "vitest";
import { validarSelecoes, escolhasDoForm, type CatalogoAtributo } from "@/lib/catalogo/catalogo";

const catalogo: CatalogoAtributo[] = [
  {
    id: "a1",
    nome: "Decote",
    tipo: "OPCAO_UNICA",
    opcoes: [
      { id: "o1", valor: "V" },
      { id: "o2", valor: "Canoa" },
    ],
  },
  { id: "a2", nome: "Brilho", tipo: "ESCALA", opcoes: [{ id: "o3", valor: "Pouco" }] },
];

describe("catálogo: validarSelecoes / escolhasDoForm (puro)", () => {
  it("ignora vazios e devolve só os atributos preenchidos", () => {
    expect(validarSelecoes(catalogo, { a1: "o1", a2: "" })).toEqual([
      { atributoId: "a1", opcaoId: "o1" },
    ]);
  });

  it("rejeita opção que não pertence ao atributo (form forjado)", () => {
    expect(() => validarSelecoes(catalogo, { a1: "o3" })).toThrow('Opção inválida para "Decote"');
  });

  it("escolhasDoForm lê os campos attr-<id> do FormData", () => {
    const fd = new FormData();
    fd.set("attr-a1", "o2");
    fd.set("attr-a2", "o3");
    expect(escolhasDoForm(catalogo, fd)).toEqual({ a1: "o2", a2: "o3" });
  });
});
