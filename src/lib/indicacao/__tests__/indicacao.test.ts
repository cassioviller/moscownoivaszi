// src/lib/indicacao/__tests__/indicacao.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { criarLead } from "@/lib/leads/leads";
import { salvarInteresse } from "@/lib/leads/interesses";
import { criarVestido } from "@/lib/vestidos/vestidos";
import { indicarVestidos } from "@/lib/indicacao/indicacao";

const MARK = "t-indic-";
let loja = "";
let lead = "";
let aDec = "";
let decV = "";
let decCanoa = "";
let aSaia = "";
let saiaSereia = "";
let saiaReta = "";

beforeAll(async () => {
  loja = (await prisma.loja.create({ data: { nome: `${MARK}loja` } })).id;
  lead = (await criarLead(loja, { noivaNome: "Bia" })).id;

  const dec = await prisma.atributo.create({
    data: {
      lojaId: loja,
      nome: "Decote",
      tipo: "OPCAO_UNICA",
      ordem: 0,
      opcoes: { create: [{ valor: "V", ordem: 0 }, { valor: "Canoa", ordem: 1 }] },
    },
    include: { opcoes: { orderBy: { ordem: "asc" } } },
  });
  const saia = await prisma.atributo.create({
    data: {
      lojaId: loja,
      nome: "Tipo de saia",
      tipo: "OPCAO_UNICA",
      ordem: 1,
      opcoes: { create: [{ valor: "Sereia", ordem: 0 }, { valor: "Reta", ordem: 1 }] },
    },
    include: { opcoes: { orderBy: { ordem: "asc" } } },
  });
  aDec = dec.id;
  decV = dec.opcoes[0].id;
  decCanoa = dec.opcoes[1].id;
  aSaia = saia.id;
  saiaSereia = saia.opcoes[0].id;
  saiaReta = saia.opcoes[1].id;

  // Noiva quer: Decote V + Saia Sereia, teto R$ 2.000.
  await salvarInteresse(loja, lead, {
    tetoOrcamento: "2.000,00",
    atributos: [
      { atributoId: aDec, opcaoId: decV },
      { atributoId: aSaia, opcaoId: saiaSereia },
    ],
  });

  // X: V + Sereia, R$ 1500 → 2 pts, dentro do teto.
  await criarVestido(loja, {
    codigo: "X",
    nome: "Perfeito",
    precoBase: "1500",
    atributos: [{ atributoId: aDec, opcaoId: decV }, { atributoId: aSaia, opcaoId: saiaSereia }],
  });
  // X2: V + Sereia, R$ 1200 → 2 pts, dentro do teto e MAIS BARATO (desempate).
  await criarVestido(loja, {
    codigo: "X2",
    nome: "Barato",
    precoBase: "1200",
    atributos: [{ atributoId: aDec, opcaoId: decV }, { atributoId: aSaia, opcaoId: saiaSereia }],
  });
  // Y: V + Reta, R$ 1000 → 1 pt, dentro.
  await criarVestido(loja, {
    codigo: "Y",
    nome: "Meio",
    precoBase: "1000",
    atributos: [{ atributoId: aDec, opcaoId: decV }, { atributoId: aSaia, opcaoId: saiaReta }],
  });
  // Z: V + Sereia, R$ 5000 → 2 pts, FORA do teto.
  await criarVestido(loja, {
    codigo: "Z",
    nome: "Caro",
    precoBase: "5000",
    atributos: [{ atributoId: aDec, opcaoId: decV }, { atributoId: aSaia, opcaoId: saiaSereia }],
  });
  // W: Canoa + Reta, R$ 900 → 0 pts → não aparece.
  await criarVestido(loja, {
    codigo: "W",
    nome: "Nada a ver",
    precoBase: "900",
    atributos: [{ atributoId: aDec, opcaoId: decCanoa }, { atributoId: aSaia, opcaoId: saiaReta }],
  });
});

afterAll(async () => {
  // Apaga filhos que referenciam Atributo (Lead→LeadInteresseAtributo e
  // Vestido→VestidoAtributo) ANTES da loja, senão o cascade da loja remove o
  // Atributo enquanto VestidoAtributo ainda o referencia (FK sem cascade).
  await prisma.lead.deleteMany({ where: { lojaId: loja } });
  await prisma.vestido.deleteMany({ where: { lojaId: loja } });
  await prisma.loja.deleteMany({ where: { id: loja } });
  await prisma.$disconnect();
});

describe("indicação de vestido por interesse", () => {
  it("ranqueia por orçamento → afinidade → preço; explica match e lacunas; ignora 0 pontos", async () => {
    const r = await indicarVestidos(loja, lead);
    // Dentro-do-teto primeiro; entre 2 pts dentro do teto, o mais barato (Barato
    // 1200 < Perfeito 1500); depois 1 pt (Meio); por fim fora do teto (Caro). W some.
    expect(r.map((v) => v.nome)).toEqual(["Barato", "Perfeito", "Meio", "Caro"]);

    const perfeito = r.find((v) => v.nome === "Perfeito")!;
    expect(perfeito).toMatchObject({ pontos: 2, total: 2, dentroDoOrcamento: true, faltam: [] });
    expect(perfeito.combinam).toEqual([
      { nome: "Decote", valor: "V" },
      { nome: "Tipo de saia", valor: "Sereia" },
    ]);

    // Meio casa só Decote V; a saia (Reta ≠ Sereia) vira lacuna.
    const meio = r.find((v) => v.nome === "Meio")!;
    expect(meio.combinam).toEqual([{ nome: "Decote", valor: "V" }]);
    expect(meio.faltam).toEqual(["Tipo de saia"]);

    expect(r.find((v) => v.nome === "Caro")?.dentroDoOrcamento).toBe(false);
  });

  it("sem interesse preenchido → []", async () => {
    const semInteresse = (await criarLead(loja, { noivaNome: "Sem interesse" })).id;
    expect(await indicarVestidos(loja, semInteresse)).toEqual([]);
  });

  it("noiva de outra loja → [] (falha fechada)", async () => {
    const outra = (await prisma.loja.create({ data: { nome: `${MARK}outra` } })).id;
    try {
      expect(await indicarVestidos(outra, lead)).toEqual([]);
    } finally {
      await prisma.loja.delete({ where: { id: outra } });
    }
  });
});
