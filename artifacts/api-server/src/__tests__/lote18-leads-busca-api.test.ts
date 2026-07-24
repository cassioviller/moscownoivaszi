import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  criarFixture,
  limparFixture,
  fecharPool,
  loginComLoja,
  criarLead,
  type Fixture,
} from "./helpers";

/**
 * E7 — busca/paginação server-side de leads.
 * A lista era "traz tudo e filtra no cliente"; agora q/etapa/pagina/porPagina
 * recortam no banco e a resposta é envelope { itens, total }.
 */
let f: Fixture;
let agent: Awaited<ReturnType<typeof loginComLoja>>;

beforeAll(async () => {
  f = await criarFixture();
  await criarLead(f, { noivaNome: "Mariana Busca", noivoNome: "Pedro Alves", whatsapp: "(11) 98888-0001" });
  await criarLead(f, { noivaNome: "Camila Busca", whatsapp: "11977770002", etapa: "PERDIDO", perdidaMotivo: "PRECO" });
  await criarLead(f, { noivaNome: "Julia Silva" });
  agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
});

afterAll(async () => {
  await limparFixture(f);
  await fecharPool();
});

describe("GET /leads — envelope e filtros server-side", () => {
  it("sem params devolve tudo (os pickers dependem da lista cheia) com total", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads`).expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.itens).toHaveLength(3);
  });

  it("q busca por nome da noiva, case-insensitive", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads?q=mariana`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].noivaNome).toBe("Mariana Busca");
  });

  it("q busca também pelo nome do noivo", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads?q=pedro`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].noivoNome).toBe("Pedro Alves");
  });

  it("q com dígitos encontra whatsapp gravado COM máscara", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads?q=11988880001`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].noivaNome).toBe("Mariana Busca");
  });

  it("q com máscara encontra whatsapp gravado SEM máscara", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads?q=(11) 97777-0002`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].noivaNome).toBe("Camila Busca");
  });

  it("etapa filtra pelo funil", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads?etapa=PERDIDO`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.itens[0].etapa).toBe("PERDIDO");
  });

  it("paginação: total é o universo do filtro, página traz só o recorte", async () => {
    const p1 = await agent.get(`/api/lojas/${f.lojaId}/leads?pagina=1&porPagina=2`).expect(200);
    expect(p1.body.total).toBe(3);
    expect(p1.body.itens).toHaveLength(2);

    const p2 = await agent.get(`/api/lojas/${f.lojaId}/leads?pagina=2&porPagina=2`).expect(200);
    expect(p2.body.total).toBe(3);
    expect(p2.body.itens).toHaveLength(1);

    // Ordem estável: nenhum lead se repete entre páginas.
    const ids = [...p1.body.itens, ...p2.body.itens].map((l: { id: string }) => l.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("etapa inválida → 400 FILTRO_INVALIDO, não 500", async () => {
    const res = await agent.get(`/api/lojas/${f.lojaId}/leads?etapa=INEXISTENTE`).expect(400);
    expect(res.body.error).toBe("FILTRO_INVALIDO");
  });
});
