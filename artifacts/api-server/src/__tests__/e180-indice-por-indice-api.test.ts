import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DUPLICADO_POR_INDICE } from "../lib/erros";

/**
 * E180 / S-O2 — **o 23505 diz QUAL regra o banco recusou.**
 *
 * O `REGISTRO_DUPLICADO` do S12/E107 tirou a frase solta do campo `error` e
 * parou ali: as restrições únicas do banco compartilhavam uma resposta só, e o
 * dado que as separa — o `constraint` que o `pg` põe no erro — chegava ao
 * handler e era jogado fora.
 *
 * O custo é medido no fluxo mais barato do sistema: cadastrar uma peça com um
 * código já usado devolvia **`409 { error: "REGISTRO_DUPLICADO", detalhe: "Já
 * existe um registro com estes dados." }`**. A vendedora não sabe qual
 * registro, qual campo, nem que o conserto é trocar o código — o 409 se lê como
 * defeito do sistema, e é o mesmo desenho do K9 (`contratos.ts:1809`), onde a
 * frase genérica fazia a cobrança legítima de uma avaria parecer já cobrada.
 *
 * Este arquivo prega as duas metades:
 *
 * 1. **A tradução acontece numa porta de verdade**, pelo caminho inteiro
 *    (rota → banco → error handler → JSON), e não só na função pura.
 * 2. **O mapa não pode envelhecer.** Cada chave dele é conferida contra o
 *    `pg_indexes` do banco em que a suíte roda. Um índice renomeado sem o mapa
 *    devolve o genérico em SILÊNCIO, que é exatamente o defeito que a linha
 *    existe para tirar — e é a forma que a S-O19 e a S-O1 já usam: quando não dá
 *    para compartilhar a constante, prega-se a igualdade.
 */
describe("E180 — o 23505 traduzido índice por índice", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /**
   * `POST /vestidos` é a porta certa para provar o caminho inteiro porque ela
   * **não tem guarda de código**: nenhuma rota confere "já existe esta peça"
   * antes de inserir, então o banco é a única palavra e a frase que a pessoa lê
   * é literalmente a deste módulo.
   */
  it("a peça com código repetido diz QUAL é o problema, e não `REGISTRO_DUPLICADO`", async () => {
    const codigo = `E180-${randomUUID().slice(0, 6)}`;
    await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo, nome: "Adelita", precoBase: 5000 })
      .expect(201);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/vestidos`)
      .send({ codigo, nome: "Adelita II", precoBase: 5200 })
      .expect(409);

    expect(r.body.error).toBe("CODIGO_EM_USO");
    expect(r.body.detalhe).toContain("código");
  });

  /** A irmã de estoque, pela mesma porta sem guarda — o saiote que se conta. */
  it("e o item de estoque repetido manda somar ao que já existe", async () => {
    const nome = `Saiote ${randomUUID().slice(0, 5)}`;
    await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome, tamanho: "M", quantidade: 3 })
      .expect(201);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/itens-estoque`)
      .send({ nome, tamanho: "M", quantidade: 2 })
      .expect(409);

    expect(r.body.error).toBe("ITEM_DE_ESTOQUE_EM_USO");
  });

  /**
   * A régua que impede o mapa de envelhecer.
   *
   * Um nome de índice é a única chave que este mapa tem, e ele mora no BANCO,
   * não no TypeScript — nada no compilador liga os dois. É a mesma classe da
   * S-A20 (`docs/migracoes` × schema drizzle), onde quatro nomes divergiram e só
   * um gritou: ninguém tropeça num índice que falta.
   */
  it("cada chave do mapa é um índice ÚNICO que existe no banco", async () => {
    const r = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef LIKE '%UNIQUE%'`);
    const noBanco = new Set((r.rows as { indexname: string }[]).map((x) => x.indexname));
    // Piso: conjunto vazio aprovaria tudo em silêncio.
    expect(noBanco.size).toBeGreaterThan(40);

    const orfaos = Object.keys(DUPLICADO_POR_INDICE).filter((k) => !noBanco.has(k));
    expect(orfaos).toEqual([]);
  });

  /**
   * E o outro lado: `error` é CÓDIGO e a prosa mora em `detalhe` (S12/E107). O
   * mapa é a maior fonte nova de `error` do repositório desde aquele épico, e
   * nasce sob a mesma régua.
   */
  it("todo código do mapa é MAIÚSCULA_COM_UNDERSCORE, e toda frase é frase", () => {
    expect(Object.keys(DUPLICADO_POR_INDICE)).toHaveLength(11);
    for (const [indice, { error, detalhe }] of Object.entries(DUPLICADO_POR_INDICE)) {
      expect(error, indice).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
      expect(detalhe.length, indice).toBeGreaterThan(20);
      expect(detalhe.endsWith("."), indice).toBe(true);
    }
  });
});
