// src/lib/catalogo/__tests__/catalogo-admin.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  criarAtributo,
  editarAtributo,
  listarAtributosAdmin,
  listarCatalogo,
  obterAtributo,
} from "@/lib/catalogo/catalogo";

const MARK = "t-catadm-";
let lojaA = "";
let lojaB = "";

beforeAll(async () => {
  lojaA = (await prisma.loja.create({ data: { nome: `${MARK}A` } })).id;
  lojaB = (await prisma.loja.create({ data: { nome: `${MARK}B` } })).id;
});

afterAll(async () => {
  await prisma.loja.deleteMany({ where: { id: { in: [lojaA, lojaB] } } }); // cascade Atributo → AtributoOpcao
  await prisma.$disconnect();
});

describe("CRUD do catálogo (admin)", () => {
  it("criarAtributo cria atributo + opções, escopado e deduplicado (C1)", async () => {
    await criarAtributo(lojaA, { nome: "Decote", tipo: "OPCAO_UNICA", opcoes: "V\nCanoa\n v \nCanoa" });
    const lista = await listarAtributosAdmin(lojaA);
    const dec = lista.find((a) => a.nome === "Decote")!;
    expect(dec.tipo).toBe("OPCAO_UNICA");
    expect(dec.opcoes.map((o) => o.valor)).toEqual(["V", "Canoa"]); // dedup case-insensitive
    // não vazou pra loja B
    expect(await listarAtributosAdmin(lojaB)).toHaveLength(0);
  });

  it("nome duplicado (case-insensitive) é rejeitado (C2)", async () => {
    await expect(criarAtributo(lojaA, { nome: "  decote ", tipo: "ESCALA", opcoes: "Pouco" })).rejects.toThrow(
      "Já existe um atributo com esse nome",
    );
  });

  it("exige nome e ao menos uma opção (C3)", async () => {
    await expect(criarAtributo(lojaA, { nome: " ", tipo: "OPCAO_UNICA", opcoes: "X" })).rejects.toThrow(
      "Nome do atributo é obrigatório",
    );
    await expect(criarAtributo(lojaA, { nome: "Cor", tipo: "OPCAO_UNICA", opcoes: "  \n " })).rejects.toThrow(
      "ao menos uma opção",
    );
    await expect(criarAtributo(lojaA, { nome: "Cor", tipo: "BANANA", opcoes: "Branco" })).rejects.toThrow(
      "Tipo de atributo inválido",
    );
  });

  it("editarAtributo renomeia, desativa opção, adiciona nova — sem apagar (C4)", async () => {
    const dec = (await listarAtributosAdmin(lojaA)).find((a) => a.nome === "Decote")!;
    const opV = dec.opcoes.find((o) => o.valor === "V")!;
    const opCanoa = dec.opcoes.find((o) => o.valor === "Canoa")!;

    await editarAtributo(lojaA, dec.id, {
      nome: "Decote do vestido",
      tipo: "OPCAO_UNICA",
      ativo: true,
      opcoesExistentes: [
        { id: opV.id, valor: "Decote V", ativo: true }, // renomeia
        { id: opCanoa.id, valor: "Canoa", ativo: false }, // desativa (não apaga)
      ],
      novasOpcoes: "Coração",
    });

    const depois = await obterAtributo(lojaA, dec.id);
    expect(depois?.nome).toBe("Decote do vestido");
    expect(depois?.opcoes).toHaveLength(3); // nada foi apagado
    expect(depois?.opcoes.find((o) => o.id === opV.id)?.valor).toBe("Decote V");
    expect(depois?.opcoes.find((o) => o.id === opCanoa.id)?.ativo).toBe(false);
    expect(depois?.opcoes.some((o) => o.valor === "Coração" && o.ativo)).toBe(true);

    // listarCatalogo (formulários) só mostra opções ativas → Canoa some.
    const cat = (await listarCatalogo(lojaA)).find((a) => a.nome === "Decote do vestido")!;
    expect(cat.opcoes.map((o) => o.valor).sort()).toEqual(["Coração", "Decote V"]);
  });

  it("atributo inativo some dos formulários mas fica na gestão (C5)", async () => {
    await criarAtributo(lojaA, { nome: "Tecido", tipo: "OPCAO_UNICA", opcoes: "Cetim\nRenda" });
    const tecido = (await listarAtributosAdmin(lojaA)).find((a) => a.nome === "Tecido")!;
    await editarAtributo(lojaA, tecido.id, {
      nome: "Tecido",
      tipo: "OPCAO_UNICA",
      ativo: false,
      opcoesExistentes: tecido.opcoes.map((o) => ({ id: o.id, valor: o.valor, ativo: o.ativo })),
      novasOpcoes: "",
    });
    expect((await listarCatalogo(lojaA)).some((a) => a.nome === "Tecido")).toBe(false);
    expect((await listarAtributosAdmin(lojaA)).some((a) => a.nome === "Tecido")).toBe(true);
  });

  it("editar atributo de outra loja falha (escopo) (C6)", async () => {
    const dec = (await listarAtributosAdmin(lojaA)).find((a) => a.nome === "Decote do vestido")!;
    await expect(
      editarAtributo(lojaB, dec.id, {
        nome: "Invasor",
        tipo: "OPCAO_UNICA",
        ativo: true,
        opcoesExistentes: [],
        novasOpcoes: "",
      }),
    ).rejects.toThrow();
  });
});
