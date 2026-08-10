import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  db,
  lojasTable,
  atributosTable,
  atributoOpcoesTable,
  vestidoAtributosTable,
  leadInteressesTable,
  leadInteresseAtributosTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  limparFixture,
  fecharPool,
  loginComLoja,
  criarVestido,
  criarLead,
  type Fixture,
} from "./helpers";

/**
 * S31 — o vocabulário do catálogo cascateia, e a guarda é de aplicação.
 *
 * A sobra diz que `lead_interesse_atributos.atributo_id` "não tem cascade" e
 * "dá 500 cru". Nenhuma das duas está inteira:
 *
 * - São **4 FKs** sem cascade, não uma, e as quatro nasceram em `NO ACTION` por
 *   OMISSÃO — `pg_get_constraintdef` devolve as quatro sem cláusula `ON DELETE`.
 *   A quinta da família (`atributo_opcoes_atributo_id`) já é CASCADE e está
 *   certa; é a assimetria que produz o defeito.
 * - **Não dá 500.** O Express 5 encaminha para `classificarErro`, que traduz o
 *   `23503` em **409 `VINCULO_EXISTENTE`** — uma resposta plausível para um
 *   pedido que não tem nada de errado.
 *
 * A régua do E91 é CONFIGURAÇÃO cascateia / HISTÓRIA recusa. `vestido_atributos`
 * é a classificação da peça no vocabulário da loja; `lead_interesse_atributos` é
 * a tradução do desejo da noiva para esse mesmo vocabulário. O que ela escreveu
 * com as próprias palavras — `algo_a_mais`, `nao_quer_usar`, `teto_orcamento` —
 * mora em `lead_interesses` e NÃO cai junto. Vocabulário é configuração: apagar
 * a palavra apaga a classificação, não a noiva.
 *
 * E como cascade sozinho apagaria em silêncio, a guarda entra na ROTA — o molde
 * é o do `DELETE /vestidos/:id` da S-A25 (`2912526`).
 */
describe("S31 — o vocabulário cascateia, e a rota avisa antes", () => {
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

  /** Um atributo com uma opção, classificando um vestido e uma noiva. */
  async function vocabularioEmUso() {
    const atributoId = randomUUID();
    await db.insert(atributosTable).values({
      id: atributoId,
      lojaId: f.lojaId,
      nome: `Cor S31 ${randomUUID().slice(0, 6)}`,
      ativo: true,
    });
    const opcaoId = randomUUID();
    await db
      .insert(atributoOpcoesTable)
      .values({ id: opcaoId, atributoId, valor: "Marfim S31" });

    const vestido = await criarVestido(f);
    await db
      .insert(vestidoAtributosTable)
      .values({ vestidoId: vestido.id, atributoId, opcaoId });

    const lead = await criarLead(f);
    const interesseId = randomUUID();
    await db.insert(leadInteressesTable).values({ id: interesseId, leadId: lead.id });
    await db
      .insert(leadInteresseAtributosTable)
      .values({ leadInteresseId: interesseId, atributoId, opcaoId });

    return { atributoId, opcaoId, vestidoId: vestido.id, leadId: lead.id };
  }

  it("VERMELHO 1 — apagar um atributo em uso responde 409 com CÓDIGO PRÓPRIO, não o genérico do banco", async () => {
    const { atributoId } = await vocabularioEmUso();

    const res = await agent.delete(`/api/lojas/${f.lojaId}/atributos/${atributoId}`);

    // Antes do conserto: 409 VINCULO_EXISTENTE, vindo do 23503 traduzido por
    // `classificarErro` — a rota não sabia que estava recusando, e a mensagem
    // não dizia quantas peças nem quantas noivas dependem da palavra.
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ATRIBUTO_EM_USO");
    expect(res.body.detalhe).toMatch(/1 peça\(s\)/);
    expect(res.body.detalhe).toMatch(/1 noiva\(s\)/);
  });

  it("VERMELHO 2 — apagar uma OPÇÃO em uso responde 409 com código próprio", async () => {
    const { opcaoId } = await vocabularioEmUso();

    const res = await agent.delete(`/api/lojas/${f.lojaId}/atributos/opcoes/${opcaoId}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("OPCAO_EM_USO");
    expect(res.body.detalhe).toMatch(/1 peça\(s\)/);
    expect(res.body.detalhe).toMatch(/1 noiva\(s\)/);
  });

  it("VERMELHO 3 — apagar a LOJA leva o vocabulário junto, sem 23503", async () => {
    // Este é o caminho que abortou o script da faxina da S-A13: a cascata da
    // loja apaga `atributos`, o gatilho de `atributo_opcoes` cascateia, e as
    // quatro checagens NO ACTION encontram linhas que só sumiriam dezenas de
    // posições depois na ordem dos gatilhos.
    const lojaId = randomUUID();
    await db.insert(lojasTable).values({ id: lojaId, nome: `Loja S31 ${randomUUID().slice(0, 8)}` });
    const atributoId = randomUUID();
    await db
      .insert(atributosTable)
      .values({ id: atributoId, lojaId, nome: "Cor S31 cascata", ativo: true });
    const opcaoId = randomUUID();
    await db.insert(atributoOpcoesTable).values({ id: opcaoId, atributoId, valor: "Marfim" });

    await expect(db.delete(lojasTable).where(eq(lojasTable.id, lojaId))).resolves.toBeDefined();

    const sobrou = await db
      .select()
      .from(atributosTable)
      .where(eq(atributosTable.id, atributoId));
    expect(sobrou).toHaveLength(0);
  });

  it("a palavra que ninguém usa sai com 204 — a guarda não é uma proibição", async () => {
    const atributoId = randomUUID();
    await db.insert(atributosTable).values({
      id: atributoId,
      lojaId: f.lojaId,
      nome: `Cor S31 livre ${randomUUID().slice(0, 6)}`,
      ativo: true,
    });

    const res = await agent.delete(`/api/lojas/${f.lojaId}/atributos/${atributoId}`);
    expect(res.status).toBe(204);
  });
});
