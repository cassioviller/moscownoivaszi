import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, lojasTable, usuariosLojasTable, vestidosTable, parcelasTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  criarContrato,
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
 * E106/S1 🔴 — apagar uma loja deixa de ser um clique sem volta.
 *
 * `DELETE /admin/lojas/:lojaId` tinha o gate certo (superadmin) e nenhuma guarda
 * de destruição: um DELETE numa linha levava junto **31 tabelas em CASCADE**,
 * entre elas `parcelas` com `recebido_em` preenchido, `pagamentos`, `vestidos` e
 * `usuarios_lojas`. Nenhuma das seis trilhas do diagnóstico o viu.
 */
describe("E106 — apagar uma loja com histórico é recusado", () => {
  let f: Fixture;
  let superAdmin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    superAdmin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma loja própria, vazia, sem nada pendurado — o caso que PODE ser apagado. */
  async function lojaVazia() {
    const id = randomUUID();
    await db.insert(lojasTable).values({ id, nome: `Loja Vazia ${id.slice(0, 8)}` });
    return id;
  }

  const apagar = (lojaId: string) => superAdmin.delete(`/api/admin/lojas/${lojaId}`);

  /**
   * O invariante, medido em `pg_constraint` e não estimado: são as 33 FKs em
   * CASCADE que transformam um DELETE numa linha em perda de caixa realizado.
   * Se alguém trocar uma delas por `restrict`, esta contagem cai e o teste
   * pergunta por quê — é o número que justifica a guarda existir.
   *
   * Era 31 até o E154, que trouxe `itens_estoque.loja_id` em cascade — a
   * arara de saiotes é da loja como o acervo é —, e 32 até o E151, que trouxe
   * `ausencias.loja_id`: as férias da equipe são da loja como a agenda é. A
   * sonda perguntou nas duas vezes, e as duas respostas são a mesma: tabela
   * nova, não FK trocada.
   */
  it("lojas continua sendo referenciada por 33 FKs em CASCADE — a razão da guarda", async () => {
    const r = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM pg_constraint
      WHERE contype = 'f' AND confrelid = 'lojas'::regclass AND confdeltype = 'c'`);
    expect((r.rows[0] as { n: number }).n).toBe(33);
  });

  it("loja inexistente responde 404 — antes respondia 204 sem ter removido nada", async () => {
    await apagar(randomUUID()).expect(404);
  });

  it("loja vazia é apagada, e some de verdade", async () => {
    const id = await lojaVazia();

    await apagar(id).expect(204);

    const [depois] = await db.select().from(lojasTable).where(eq(lojasTable.id, id));
    expect(depois).toBeUndefined();
  });

  /**
   * O caso que dá nome ao achado: a loja da fixture tem contrato, parcelas e
   * equipe. **A asserção que importa não é o 409 — é a parcela ainda estar
   * lá depois dele.**
   */
  it("com contrato e parcelas, recusa com 409 — e o dinheiro continua no banco", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-5),
    });
    await superAdmin
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    const antes = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.lojaId, f.lojaId));
    expect(antes.length).toBeGreaterThan(0);

    const r = await apagar(f.lojaId).expect(409);

    expect(r.body.error).toBe("LOJA_COM_HISTORICO");
    const depois = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.lojaId, f.lojaId));
    expect(depois.length).toBe(antes.length);
    const [loja] = await db.select().from(lojasTable).where(eq(lojasTable.id, f.lojaId));
    expect(loja).toBeDefined();
  });

  it("a mensagem NOMEIA o que bloqueia e ensina o caminho que preserva", async () => {
    const r = await apagar(f.lojaId).expect(409);

    expect(r.body.detalhe).toMatch(/parcela\(s\)/);
    expect(r.body.detalhe).toMatch(/contrato\(s\)/);
    expect(r.body.detalhe).toMatch(/pessoa\(s\) na equipe/);
    expect(r.body.detalhe).toMatch(/Desative a loja em vez de excluir/);
  });

  /**
   * **A contagem não é só de dinheiro.** Uma loja sem contrato nenhum pode ter o
   * acervo fotografado e a equipe montada — é trabalho, e some igual. Estes dois
   * casos existem porque a régua "tem dinheiro?" os deixaria passar.
   */
  it("só o acervo já basta para recusar — 200 vestidos são trabalho", async () => {
    const id = await lojaVazia();
    const vestido = await criarVestido({ ...f, lojaId: id });

    const r = await apagar(id).expect(409);
    expect(r.body.detalhe).toMatch(/vestido\(s\) no acervo/);

    await db.delete(vestidosTable).where(eq(vestidosTable.id, vestido.id));
    await db.delete(lojasTable).where(eq(lojasTable.id, id));
  });

  it("só a equipe já basta para recusar — apagar levaria os vínculos junto", async () => {
    const id = await lojaVazia();
    await db.insert(usuariosLojasTable).values({
      usuarioId: f.vendedoraId,
      lojaId: id,
      perfilId: f.perfilId,
    });

    const r = await apagar(id).expect(409);
    expect(r.body.detalhe).toMatch(/pessoa\(s\) na equipe/);

    await db.delete(usuariosLojasTable).where(eq(usuariosLojasTable.lojaId, id));
    await db.delete(lojasTable).where(eq(lojasTable.id, id));
  });

  /**
   * A mensagem manda desativar. O caminho tem de EXISTIR — senão o 409 é o beco
   * que o E98/F3 passou a rodada fechando, agora vestido de conselho.
   */
  it("o caminho que a mensagem ensina funciona: desativada, a loja sai dos seletores", async () => {
    const id = await lojaVazia();
    await db.insert(usuariosLojasTable).values({
      usuarioId: f.vendedoraId,
      lojaId: id,
      perfilId: f.perfilId,
    });
    await superAdmin.patch(`/api/admin/lojas/${id}`).send({ ativo: false }).expect(200);

    const sessao = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const r = await sessao.get("/api/auth/me").expect(200);
    expect((r.body.lojas as { id: string }[]).map((l) => l.id)).not.toContain(id);

    // E nada foi perdido: a loja e o vínculo continuam lá.
    const [loja] = await db.select().from(lojasTable).where(eq(lojasTable.id, id));
    expect(loja.ativo).toBe(false);

    await db.delete(usuariosLojasTable).where(eq(usuariosLojasTable.lojaId, id));
    await db.delete(lojasTable).where(eq(lojasTable.id, id));
  });

  it("quem não é superadmin não chega à rota", async () => {
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const id = await lojaVazia();

    await vendedora.delete(`/api/admin/lojas/${id}`).expect(403);

    const [loja] = await db.select().from(lojasTable).where(eq(lojasTable.id, id));
    expect(loja).toBeDefined();
    await db.delete(lojasTable).where(eq(lojasTable.id, id));
  });
});
