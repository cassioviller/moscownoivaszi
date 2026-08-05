import { afterAll, describe, expect, it } from "vitest";
import { db, usuariosTable, usuariosLojasTable } from "@workspace/db";
import { eq, inArray, isNull, and, sql } from "drizzle-orm";
import { criarFixture, fecharPool, limparFixture, loginComLoja } from "./helpers";

/**
 * S18 — a fixture leva embora quem nasceu dentro dela.
 *
 * `limparFixture` apagava usuário **por ID**, e só os dois que o `Fixture`
 * conhece. Toda pessoa criada pela ROTA — `POST /lojas/:id/equipe`, o caminho
 * que a própria suíte exercita dezenas de vezes — tem id que nunca entra ali: o
 * cascade da loja levava só o VÍNCULO, e a pessoa ficava órfã no banco para
 * sempre.
 *
 * Medido em 2026-08-05, antes do conserto: **1.629 usuários órfãos, 98% dos
 * 1.667** do banco de dev, contra 613 quando o E100 mediu. Cada passada da suíte
 * acrescentava. O custo não é o disco — `GET /admin/usuarios` não pagina e
 * devolve a tabela inteira.
 *
 * "Higiene de fixture em lugar COMPARTILHADO não é higiene: é uma bomba
 * esperando a primeira escrita." A frase é da própria sobra, e este teste é o
 * que a desarma.
 */
describe("S18 — a fixture não deixa gente para trás", () => {
  afterAll(async () => {
    await fecharPool();
  });

  const orfaos = async (ids: string[]) =>
    db
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(inArray(usuariosTable.id, ids));

  it("quem foi criado pela ROTA some junto com a loja", async () => {
    const f = await criarFixture();
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    // O caminho real: a dona cadastra alguém pela tela de equipe. O id nasce no
    // servidor e a fixture nunca o vê.
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/equipe`)
      .send({
        nome: "Contratada pela Rota",
        email: `rota-${f.lojaId.slice(0, 8)}@teste.com`,
        senha: "senha-de-teste-123",
        perfilId: f.perfilId,
      })
      .expect(201);
    const pelaRota = r.body.usuarioId as string;
    expect((await orfaos([pelaRota]))).toHaveLength(1);

    await limparFixture(f);

    // Antes do conserto, esta linha achava a pessoa — órfã, sem vínculo, para
    // sempre.
    expect(await orfaos([pelaRota])).toHaveLength(0);
    expect(await orfaos([f.vendedoraId, f.superAdminId])).toHaveLength(0);
  });

  it("quem tem OUTRA loja fica — a fixture não é dona da pessoa", async () => {
    const casa = await criarFixture();
    const outra = await criarFixture();
    const agent = await loginComLoja(casa.superAdminEmail, casa.lojaId);

    const r = await agent
      .post(`/api/lojas/${casa.lojaId}/equipe`)
      .send({
        nome: "Trabalha nas Duas",
        email: `duas-${casa.lojaId.slice(0, 8)}@teste.com`,
        senha: "senha-de-teste-123",
        perfilId: casa.perfilId,
      })
      .expect(201);
    const dasDuas = r.body.usuarioId as string;

    // A mesma pessoa também é da outra loja.
    await db
      .insert(usuariosLojasTable)
      .values({ usuarioId: dasDuas, lojaId: outra.lojaId, perfilId: outra.perfilId });

    await limparFixture(casa);

    // Ela sobrevive: perdeu um vínculo, não o emprego.
    expect(await orfaos([dasDuas])).toHaveLength(1);
    const restantes = await db
      .select({ lojaId: usuariosLojasTable.lojaId })
      .from(usuariosLojasTable)
      .where(eq(usuariosLojasTable.usuarioId, dasDuas));
    expect(restantes.map((v) => v.lojaId)).toEqual([outra.lojaId]);

    await limparFixture(outra);
    // Sem loja nenhuma, aí sim ela sai.
    expect(await orfaos([dasDuas])).toHaveLength(0);
  });

  /**
   * A rede contra a volta do defeito: depois de uma passada inteira da suíte, o
   * banco não deve estar cheio de gente sem loja. O limite é folgado de
   * propósito — o banco de dev carrega o passivo histórico até alguém rodar a
   * limpeza —, e serve para reprovar CRESCIMENTO, não para exigir zero.
   */
  it("o banco de dev não é um cemitério de usuários sem loja", async () => {
    const [{ orfaos: quantos }] = await db
      .select({ orfaos: sql<number>`count(*)::int` })
      .from(usuariosTable)
      .leftJoin(usuariosLojasTable, eq(usuariosLojasTable.usuarioId, usuariosTable.id))
      .where(and(isNull(usuariosLojasTable.usuarioId), eq(usuariosTable.isSuperAdmin, false)));

    expect(
      quantos,
      `${quantos} usuários sem loja nenhuma. A fixture parou de vazar na S18; ` +
        `se este número voltar a subir, alguma escrita nova está criando gente ` +
        `fora do caminho que \`limparFixture\` conhece.`,
    ).toBeLessThan(200);
  });
});
