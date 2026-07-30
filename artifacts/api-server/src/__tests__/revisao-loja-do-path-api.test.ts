import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * A loja da URL volta a ser conferida contra a da sessão.
 *
 * `requireSessaoComLoja` comparava `req.params.lojaId` com `sessao.lojaAtivaId`
 * — e os DEZ routers de domínio o montam com `router.use(fn)` SEM path, posição
 * em que `req.params` é `{}`. O `if` era pulado em silêncio: nunca falhava,
 * nunca rodava. Medido nesta árvore antes do conserto, com uma VENDEDORA comum
 * da loja A e a sessão em A:
 *
 * - `GET /api/lojas/<B>/leads` → 200 com a noiva secreta da loja B
 * - `GET /api/lojas/<B>/leads/<leadB>` → 200, a ficha inteira
 * - `PATCH /api/lojas/<B>/leads/<leadB>` → 200, renomeada
 * - `DELETE /api/lojas/<B>/leads/<leadB>` → 204, apagada
 *
 * `requireModulo` não segurava nada disso: ele consulta as permissões de
 * `lojaAtivaId` (A) e aprova; o handler então consulta `where lojaId = B`. O
 * E91 fechou os ids do CORPO e deixou aberto o id do PATH — e o
 * `e2e/50-loja-da-url.spec.ts` afirmava por escrito o 403 que nunca testou
 * contra a API.
 */
describe("A loja da URL é conferida também nos routers montados sem path", () => {
  let A: Fixture;
  let B: Fixture;
  let agenteA: Awaited<ReturnType<typeof loginComLoja>>;
  let leadB: string;

  beforeAll(async () => {
    A = await criarFixture();
    B = await criarFixture();
    agenteA = await loginComLoja(A.vendedoraEmail, A.lojaId);
    leadB = (await criarLead(B, { noivaNome: "NOIVA SECRETA DA LOJA B" })).id;
  });

  afterAll(async () => {
    await limparFixture(A);
    await limparFixture(B);
    await fecharPool();
  });

  it("LER a lista de leads da outra loja é 403 (antes: 200 com a noiva dela)", async () => {
    const r = await agenteA.get(`/api/lojas/${B.lojaId}/leads`).expect(403);
    expect(JSON.stringify(r.body)).not.toContain("NOIVA SECRETA DA LOJA B");
  });

  it("LER a ficha de uma noiva da outra loja é 403", async () => {
    await agenteA.get(`/api/lojas/${B.lojaId}/leads/${leadB}`).expect(403);
  });

  it("ESCREVER na noiva da outra loja é 403 — e ela continua com o nome dela", async () => {
    await agenteA
      .patch(`/api/lojas/${B.lojaId}/leads/${leadB}`)
      .send({ noivaNome: "RENOMEADA PELO VIZINHO" })
      .expect(403);

    const [vitima] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadB));
    expect(vitima.noivaNome).toBe("NOIVA SECRETA DA LOJA B");
  });

  it("APAGAR a noiva da outra loja é 403 — e ela continua existindo", async () => {
    await agenteA.delete(`/api/lojas/${B.lojaId}/leads/${leadB}`).expect(403);
    const [viva] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadB));
    expect(viva).toBeDefined();
  });

  it("os outros routers de domínio fecham pela mesma porta", async () => {
    for (const caminho of [
      "contratos",
      "orcamentos",
      "vestidos",
      "atributos",
      "bloqueios",
      "atendimentos",
      "equipe",
      "financeiro/parcelas",
      "comissao/regras",
    ]) {
      const r = await agenteA.get(`/api/lojas/${B.lojaId}/${caminho}`);
      expect({ caminho, status: r.status }).toEqual({ caminho, status: 403 });
    }
  });

  it("a PRÓPRIA loja continua respondendo — o guard não fecha a porta de casa", async () => {
    await agenteA.get(`/api/lojas/${A.lojaId}/leads`).expect(200);
    await agenteA.get(`/api/lojas/${A.lojaId}/contratos`).expect(200);
  });
});
