import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, auditLogTable, lojasTable, usuariosTable } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S3 — o ato GLOBAL de superadmin passa a deixar rastro.
 *
 * `audit_log.loja_id` era `notNull`, e a trilha inteira é por loja. As duas
 * ações que não pertencem a loja nenhuma ficavam de fora:
 *
 * · `DELETE /admin/usuarios/:id` — pessoas são tabela GLOBAL;
 * · `DELETE /admin/lojas/:id` — e aqui a coluna era pior que inútil. Gravar
 *   "loja X apagada" com `loja_id = X` num FK em CASCADE **apaga o próprio
 *   registro junto com a loja**: o rastro morreria no mesmo instante em que
 *   passasse a importar.
 *
 * O que sobrava era um `req.log.warn` — greppável enquanto o log existir, e
 * invisível para quem abre o sistema. Um ato irreversível que não deixa rastro
 * é a soma das duas lentes mais caras da R7: irreversibilidade e silêncio.
 *
 * `loja_id` nulo passa a significar **ato global**, e é assim que o registro
 * sobrevive ao que ele registra.
 */
describe("S3 — o que não é de loja nenhuma também deixa rastro", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await db.delete(auditLogTable).where(isNull(auditLogTable.lojaId));
    await limparFixture(f);
    await fecharPool();
  });

  const globais = () =>
    db.select().from(auditLogTable).where(isNull(auditLogTable.lojaId));

  /** Uma pessoa sem história nenhuma — a única que o sistema deixa apagar. */
  async function pessoaDescartavel() {
    const id = randomUUID();
    await db.insert(usuariosTable).values({
      id,
      nome: "Fulana de Passagem",
      email: `passagem-${id.slice(0, 8)}@teste.com`,
      senhaHash: await bcrypt.hash("seja-o-que-for", 4),
      ativo: true,
      isSuperAdmin: false,
    });
    return id;
  }

  it("apagar uma pessoa deixa rastro, e o rastro não é de loja nenhuma", async () => {
    const usuarioId = await pessoaDescartavel();
    await agent.delete(`/api/admin/usuarios/${usuarioId}`).expect(204);

    const linhas = await globais();
    const linha = linhas.find((l) => l.entidadeId === usuarioId)!;
    expect(linha).toBeTruthy();
    expect(linha.lojaId).toBeNull();
    expect(linha.acao).toBe("USUARIO_EXCLUIDO");
    expect(linha.entidade).toBe("usuario");
    // O nome vai DESNORMALIZADO: quem lê a trilha depois não tem mais a linha
    // da pessoa para consultar — ela é justamente o que sumiu.
    expect(JSON.stringify(linha.detalhe)).toContain("Fulana de Passagem");
    // E quem fez também fica.
    expect(linha.usuarioId).toBe(f.superAdminId);
  });

  it("apagar uma loja deixa rastro que SOBREVIVE à loja", async () => {
    const lojaId = randomUUID();
    await db.insert(lojasTable).values({ id: lojaId, nome: "Loja de Passagem" });

    await agent.delete(`/api/admin/lojas/${lojaId}`).expect(204);

    // A loja se foi — e é isto que a coluna nula existe para permitir: com
    // `loja_id = lojaId` o CASCADE teria apagado o registro junto.
    const [aLoja] = await db.select().from(lojasTable).where(eq(lojasTable.id, lojaId));
    expect(aLoja).toBeUndefined();

    const linha = (await globais()).find((l) => l.entidadeId === lojaId)!;
    expect(linha).toBeTruthy();
    expect(linha.lojaId).toBeNull();
    expect(linha.acao).toBe("LOJA_EXCLUIDA");
    expect(JSON.stringify(linha.detalhe)).toContain("Loja de Passagem");
  });

  it("o ato global tem porta de leitura, e ela é só do superadmin", async () => {
    const usuarioId = await pessoaDescartavel();
    await agent.delete(`/api/admin/usuarios/${usuarioId}`).expect(204);

    const r = await agent.get(`/api/admin/auditoria-global`).expect(200);
    expect(r.body.some((l: { entidadeId: string }) => l.entidadeId === usuarioId)).toBe(true);

    // A vendedora não é superadmin: a porta inteira do /admin é dela negada.
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora.get(`/api/admin/auditoria-global`).expect(403);
  });

  it("o ato global NÃO polui a trilha de nenhuma loja", async () => {
    const usuarioId = await pessoaDescartavel();
    await agent.delete(`/api/admin/usuarios/${usuarioId}`).expect(204);

    const daLoja = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.entidadeId, usuarioId)));
    expect(daLoja).toHaveLength(0);

    // E a tela de auditoria da loja continua respondendo o que é dela.
    const r = await agent.get(`/api/lojas/${f.lojaId}/financeiro/auditoria`).expect(200);
    const linhas = (r.body.linhas ?? r.body) as { entidadeId: string }[];
    expect(linhas.some((l) => l.entidadeId === usuarioId)).toBe(false);
  });
});
