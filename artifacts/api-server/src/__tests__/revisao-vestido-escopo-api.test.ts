import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, atributosTable, atributoOpcoesTable, vestidoAtributosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * A ficha do vestido da vizinha não é apagada por engano — nem enriquecida com
 * o vocabulário dela.
 *
 * `PATCH /lojas/:lojaId/vestidos/:vestidoId` rodava a transação ANTES de provar
 * que o vestido é da loja: o `tx.update` era escopado e não fazia nada, mas o
 * `tx.delete(vestido_atributos)` filtrava SÓ por `vestidoId` e destruía. Medido
 * antes do conserto: `PATCH /api/lojas/<A>/vestidos/<de-B>` com
 * `{"atributos": []}` respondia **404 e deixava o vestido de B com zero
 * atributos** — a ficha de tamanho, cor e categoria vazia, sem trilha e sem
 * ninguém a quem perguntar. O 404 saía da consulta pós-commit: cosmético. É o
 * mesmo padrão B1 que o E91 consertou no `PATCH /equipe`.
 *
 * E os pares (atributo, opção) entravam sem prova de pertencimento: a FK só
 * garante que o id EXISTE.
 */
describe("Escopo de loja na ficha de atributos do vestido", () => {
  let A: Fixture;
  let B: Fixture;
  let agenteA: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    A = await criarFixture();
    B = await criarFixture();
    agenteA = await loginComLoja(A.superAdminEmail, A.lojaId);
  });

  afterAll(async () => {
    // `vestido_atributos.atributo_id` não é cascade (a régua do atributo não
    // some com a loja por acidente), e a ordem em que o Postgres dispara os
    // gatilhos do delete da loja não é garantida — o mesmo tropeço que o
    // `limparFixture` já documenta para contrato×lead.
    for (const vestidoId of vestidosCriados) {
      await db.delete(vestidoAtributosTable).where(eq(vestidoAtributosTable.vestidoId, vestidoId));
    }
    await limparFixture(A);
    await limparFixture(B);
    await fecharPool();
  });

  const vestidosCriados: string[] = [];
  async function vestidoDe(f: Fixture) {
    const v = await criarVestido(f);
    vestidosCriados.push(v.id);
    return v;
  }

  async function atributoCom(f: Fixture, nome: string, valor: string) {
    const atributoId = randomUUID();
    const opcaoId = randomUUID();
    await db.insert(atributosTable).values({ id: atributoId, lojaId: f.lojaId, nome });
    await db.insert(atributoOpcoesTable).values({ id: opcaoId, atributoId, valor });
    return { atributoId, opcaoId };
  }

  it("editar vestido de OUTRA loja é 404 — e os atributos dele continuam lá", async () => {
    const vestidoB = await vestidoDe(B);
    const { atributoId, opcaoId } = await atributoCom(B, "Cor da loja B", "Marfim B");
    await db.insert(vestidoAtributosTable).values({ vestidoId: vestidoB.id, atributoId, opcaoId });

    await agenteA
      .patch(`/api/lojas/${A.lojaId}/vestidos/${vestidoB.id}`)
      .send({ atributos: [] })
      .expect(404);

    const restantes = await db
      .select()
      .from(vestidoAtributosTable)
      .where(eq(vestidoAtributosTable.vestidoId, vestidoB.id));
    expect(restantes).toHaveLength(1);
  });

  it("atributo de outra loja não entra na ficha — nem no PATCH nem no POST", async () => {
    const vestidoA = await vestidoDe(A);
    const alheio = await atributoCom(B, "Cor da loja B", "Marfim B");

    const patch = await agenteA
      .patch(`/api/lojas/${A.lojaId}/vestidos/${vestidoA.id}`)
      .send({ atributos: [alheio] })
      .expect(422);
    expect(patch.body.error).toBe("REFERENCIA_INVALIDA");

    const post = await agenteA
      .post(`/api/lojas/${A.lojaId}/vestidos`)
      .send({
        codigo: `VT-${randomUUID().slice(0, 8)}`,
        nome: "Vestido com cor da vizinha",
        precoBase: 5000,
        atributos: [alheio],
      })
      .expect(422);
    expect(post.body.error).toBe("REFERENCIA_INVALIDA");
  });

  it("a opção tem de ser DO atributo com que ela vem", async () => {
    const vestidoA = await vestidoDe(A);
    const cor = await atributoCom(A, "Cor", "Marfim");
    const tamanho = await atributoCom(A, "Tamanho", "38");

    await agenteA
      .patch(`/api/lojas/${A.lojaId}/vestidos/${vestidoA.id}`)
      .send({ atributos: [{ atributoId: cor.atributoId, opcaoId: tamanho.opcaoId }] })
      .expect(422);
  });

  it("a ficha da PRÓPRIA loja continua sendo editada normalmente", async () => {
    const vestidoA = await vestidoDe(A);
    const cor = await atributoCom(A, "Cor", "Marfim");

    await agenteA
      .patch(`/api/lojas/${A.lojaId}/vestidos/${vestidoA.id}`)
      .send({ atributos: [cor] })
      .expect(200);

    const gravados = await db
      .select()
      .from(vestidoAtributosTable)
      .where(eq(vestidoAtributosTable.vestidoId, vestidoA.id));
    expect(gravados).toHaveLength(1);
    expect(gravados[0].opcaoId).toBe(cor.opcaoId);
  });
});
