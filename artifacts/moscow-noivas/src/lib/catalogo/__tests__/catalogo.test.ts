// src/lib/catalogo/__tests__/catalogo.test.ts
import { describe, it, expect } from "vitest";
import {
  validarSelecoes,
  escolhasDoForm,
  rotularSelecoes,
  type CatalogoAtributo,
} from "@/lib/catalogo/catalogo";

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

describe("catálogo: rotularSelecoes (puro)", () => {
  it("traduz seleções em rótulos legíveis, na ordem do catálogo", () => {
    expect(
      rotularSelecoes(catalogo, [
        { atributoId: "a2", opcaoId: "o3" },
        { atributoId: "a1", opcaoId: "o1" },
      ]),
    ).toEqual([
      { nome: "Decote", valor: "V" }, // a1 vem antes de a2 (ordem do catálogo)
      { nome: "Brilho", valor: "Pouco" },
    ]);
  });

  it("ignora atributo/opção que não existe mais no catálogo ativo", () => {
    expect(
      rotularSelecoes(catalogo, [
        { atributoId: "a1", opcaoId: "inexistente" }, // opção sumiu
        { atributoId: "removido", opcaoId: "o9" }, // atributo sumiu
      ]),
    ).toEqual([]);
  });
});
