import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, contratoBloqueiosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-M7 — a corrida da reserva exclusiva, reproduzida de verdade.
 *
 * A guarda `presosPorContratoAtivo` do POST /contratos é lida no pool global,
 * FORA da transação que escreve o vínculo — e a PK de `contrato_bloqueios`
 * (contratoId, bloqueioId) aceita o mesmo bloqueio em dois contratos. Duas
 * vendedoras no mesmo segundo liam as duas "livre" e o mesmo vestido saía
 * prometido a duas noivas — o caso exato que o E107 fechou no caminho lento,
 * reaberto pela janela entre a leitura e a escrita.
 *
 * O conserto é o da S33 (`DELETE /admin/lojas`): `FOR UPDATE` na linha do
 * bloqueio dentro da transação, e a reconferência como statement novo. A
 * corrida aqui é determinística, não um sleep de sorte: a segunda conexão
 * segura um vínculo NÃO COMMITADO — o `FOR KEY SHARE` que o INSERT dele tomou
 * na linha do bloqueio conflita com o `FOR UPDATE` da rota — e só commita
 * depois de a rota já estar pendurada na tranca. Antes do conserto, a guarda
 * via zero e os DOIS vínculos commitavam; depois, a reconferência vê o
 * vencedor: 409, e o vestido tem um contrato só.
 */
describe("S-M7 — a corrida da reserva exclusiva do POST /contratos", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("o vínculo em voo segura a tranca, e a reconferência VÊ o vencedor: 409, um contrato só", async () => {
    // O vestido de um só: bloqueio SEM dona (leadId nulo — a reserva que a
    // loja segurou antes de saber de quem seria), que os DOIS contratos podem
    // legalmente reivindicar. Sem data de casamento nos contratos, nenhuma
    // guarda de data atrapalha a corrida.
    const noivaA = await criarLead(f);
    const noivaB = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(120),
    });

    const contratoVencedorId = randomUUID();
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      // O contrato da noiva B, com o vínculo NÃO COMMITADO: o INSERT do
      // vínculo toma FOR KEY SHARE na linha do bloqueio.
      await cliente.query(
        `INSERT INTO contratos (id, loja_id, lead_id, vendedora_id, valor_total)
         VALUES ($1, $2, $3, $4, 5000)`,
        [contratoVencedorId, f.lojaId, noivaB.id, f.vendedoraId],
      );
      await cliente.query(
        "INSERT INTO contrato_bloqueios (contrato_id, bloqueio_id) VALUES ($1, $2)",
        [contratoVencedorId, bloqueio.id],
      );

      // A rota fica pendurada no FOR UPDATE enquanto o vínculo não commita.
      // O `Test` do supertest é LAZY (S33): o Promise.resolve dispara AGORA.
      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
          leadId: noivaA.id,
          vendedoraId: f.vendedoraId,
          valorTotal: 4200,
          bloqueioVestidoIds: [bloqueio.id],
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      // VERMELHO ANTES: 201 — e o vestido ficava prometido às duas noivas.
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("RESERVA_JA_CONTRATADA");
    } finally {
      cliente.release();
    }

    // O invariante, medido no banco: a reserva tem UM contrato, o da noiva B.
    const vinculos = await db
      .select()
      .from(contratoBloqueiosTable)
      .where(eq(contratoBloqueiosTable.bloqueioId, bloqueio.id));
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]!.contratoId).toBe(contratoVencedorId);
  });

  it("sem corrida, o caminho feliz continua: 201 e o vínculo escrito", async () => {
    const noiva = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(150),
    });

    const resposta = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: noiva.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 3000,
      bloqueioVestidoIds: [bloqueio.id],
    });
    expect(resposta.status).toBe(201);

    const vinculos = await db
      .select()
      .from(contratoBloqueiosTable)
      .where(eq(contratoBloqueiosTable.bloqueioId, bloqueio.id));
    expect(vinculos).toHaveLength(1);
  });
});
