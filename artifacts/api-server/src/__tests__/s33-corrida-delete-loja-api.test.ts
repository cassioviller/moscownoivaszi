import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, lojasTable, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * S33 — a corrida do DELETE /admin/lojas, reproduzida de verdade.
 *
 * O DELETE sempre esteve em transação; quem ficava fora era a LEITURA da
 * guarda, e em READ COMMITTED movê-la para dentro não fecharia nada. O
 * conserto é o `FOR UPDATE` na linha da loja: todo INSERT de filho precisa de
 * `FOR KEY SHARE` na linha-pai, que conflita com FOR UPDATE.
 *
 * A corrida aqui é determinística, não um sleep de sorte: a segunda conexão
 * segura um INSERT NÃO COMMITADO de lead — o KEY SHARE dela bloqueia o
 * FOR UPDATE da rota — e só commita depois de a rota já estar pendurada na
 * tranca. Antes do conserto, a contagem via zero, o DELETE esperava o commit
 * e CASCATEAVA o lead recém-nascido: 204 com trabalho indo embora. Depois, a
 * contagem (statement novo, snapshot novo) vê o lead: 409, e o lead vive.
 */
describe("S33 — a corrida do DELETE /admin/lojas", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  // A loja da fixture tem equipe (2 vínculos) e recusaria por isso; a corrida
  // precisa de uma loja VAZIA de verdade, criada direto no banco.
  async function criarLojaVazia(): Promise<string> {
    const id = randomUUID();
    await db.insert(lojasTable).values({ id, nome: `Loja Corrida ${id.slice(0, 8)}` });
    return id;
  }

  it("o insert em voo segura a tranca, e a guarda VÊ o filho: 409 e o lead vive", async () => {
    const lojaId = await criarLojaVazia();
    const leadId = randomUUID();

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query(
        "INSERT INTO leads (id, loja_id, noiva_nome, etapa, origem) VALUES ($1, $2, $3, 'NOVO', 'LOJA')",
        [leadId, lojaId, "Noiva da Corrida"],
      );

      // A rota fica pendurada no FOR UPDATE enquanto o INSERT não commita.
      // O `Test` do supertest é LAZY — só manda a request no `.then()` —, e a
      // primeira versão deste teste "corria" com a request ainda no papel:
      // passava verde até no código sem o conserto. O Promise.resolve assimila
      // o thenable e dispara a request AGORA, antes do sleep.
      const respostaP = Promise.resolve(admin.delete(`/api/admin/lojas/${lojaId}`));
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("LOJA_COM_HISTORICO");
      expect(resposta.body.detalhe).toContain("1 noiva(s)");
    } finally {
      cliente.release();
    }

    // O lead sobreviveu — antes do conserto, o CASCADE o levava.
    const [vivo] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
    expect(vivo).toBeTruthy();

    // Faxina: o lead sai primeiro (FK), depois a loja.
    await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    await db.delete(lojasTable).where(eq(lojasTable.id, lojaId));
  });

  it("sem corrida, loja vazia continua saindo com 204 e rastro global", async () => {
    const lojaId = await criarLojaVazia();
    const resposta = await admin.delete(`/api/admin/lojas/${lojaId}`);
    expect(resposta.status).toBe(204);
    const [sumida] = await db.select().from(lojasTable).where(eq(lojasTable.id, lojaId));
    expect(sumida).toBeUndefined();
  });
});
