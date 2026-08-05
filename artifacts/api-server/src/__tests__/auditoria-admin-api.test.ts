import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, auditLogTable, sessoesTable, usuariosTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { criarFixture, fecharPool, limparFixture, loginComLoja, SENHA_TESTE, type Fixture } from "./helpers";

/**
 * E56 — administração na trilha, e a permissão que passa a valer NA HORA.
 *
 * A trilha era 100% financeira: o feed do E18 dizia "sem ações sensíveis"
 * justamente para quem só administra. E a permissão vive na sessão — rebaixar
 * alguém não tinha efeito enquanto a aba estivesse aberta, por até 8 horas.
 * Permissão revogada que continua valendo não é permissão.
 */
describe("Auditoria de administração e sessões (E56)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    // S18: antes da fixture — depois dela a loja já não existe, e quem foi
    // desvinculado no meio do teste ficaria sem ninguém para reclamá-lo.
    if (membrosCriados.length > 0) {
      await db.delete(usuariosTable).where(inArray(usuariosTable.id, membrosCriados));
    }
    await limparFixture(f);
    await fecharPool();
  });

  const trilhaDe = (acao: string) =>
    db.select().from(auditLogTable).where(and(
      eq(auditLogTable.lojaId, f.lojaId),
      eq(auditLogTable.acao, acao),
    ));

  const sessoesDe = (usuarioId: string) =>
    db.select().from(sessoesTable).where(eq(sessoesTable.usuarioId, usuarioId));

  /**
   * S18 — os membros que este arquivo cria ficam anotados, e saem no `afterAll`.
   *
   * `limparFixture` passou a levar embora quem ficou sem vínculo NENHUM depois
   * de a loja sumir, e isso cobre a esmagadora maioria dos casos. **Este arquivo
   * é a exceção**, e é uma exceção honesta: um dos testes REMOVE o membro da
   * loja de propósito (é o que ele prova), e a partir daí a pessoa não aparece
   * mais na varredura de vínculos da fixture — ela já não é da loja quando a
   * limpeza roda.
   *
   * Medido: com a fixture consertada e sem esta lista, uma passada da suíte
   * ainda deixava UM órfão, e era este.
   */
  const membrosCriados: string[] = [];

  /** Um membro novo da loja, já logado (com sessão viva). */
  async function membroLogado(): Promise<{ id: string; email: string }> {
    const sufixo = randomUUID().slice(0, 8);
    const email = `membro-${sufixo}@teste.local`;
    const res = await admin
      .post(`/api/lojas/${f.lojaId}/equipe`)
      .send({ nome: `Membro ${sufixo}`, email, senha: SENHA_TESTE, perfilId: f.perfilId })
      .expect(201);
    await loginComLoja(email, f.lojaId);
    membrosCriados.push(res.body.usuarioId);
    return { id: res.body.usuarioId, email };
  }

  it("adicionar membro deixa linha — sem senha nem hash no detalhe", async () => {
    const membro = await membroLogado();

    const [linha] = await trilhaDe("MEMBRO_ADICIONADO");
    expect(linha).toBeTruthy();
    expect(linha.entidade).toBe("usuario");
    expect(linha.entidadeId).toBe(membro.id);
    // A trilha é lida por gente e exportada em CSV (E47).
    const cru = JSON.stringify(linha.detalhe);
    expect(cru).not.toContain(SENHA_TESTE);
    expect(cru).not.toContain("senhaHash");
  });

  it("trocar o perfil derruba as sessões vivas do membro", async () => {
    const membro = await membroLogado();
    expect((await sessoesDe(membro.id)).length).toBeGreaterThan(0);

    await admin
      .patch(`/api/lojas/${f.lojaId}/equipe/${membro.id}`)
      .send({ perfilId: f.perfilId })
      .expect(200);

    // Mesmo trocando para o MESMO perfil: o pedido foi de mudança de acesso, e
    // a rota não adivinha intenção — derrubar a mais é seguro, a menos não.
    expect(await sessoesDe(membro.id)).toHaveLength(0);

    const linhas = await trilhaDe("MEMBRO_ALTERADO");
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.at(-1)!.detalhe).toMatchObject({ sessoesEncerradas: true });
  });

  it("renomear NÃO derruba sessão — não mudou acesso nenhum", async () => {
    const membro = await membroLogado();
    await admin
      .patch(`/api/lojas/${f.lojaId}/equipe/${membro.id}`)
      .send({ nome: "Nome Corrigido" })
      .expect(200);

    // Obrigar a pessoa a logar de novo porque alguém corrigiu um acento no
    // nome dela seria castigo sem motivo.
    expect((await sessoesDe(membro.id)).length).toBeGreaterThan(0);
  });

  it("inativar derruba a sessão; reativar não precisa", async () => {
    const membro = await membroLogado();
    await admin
      .patch(`/api/lojas/${f.lojaId}/equipe/${membro.id}`)
      .send({ ativo: false })
      .expect(200);
    expect(await sessoesDe(membro.id)).toHaveLength(0);

    // Reativar não tem sessão a derrubar — e criar uma seria o login dela.
    await admin
      .patch(`/api/lojas/${f.lojaId}/equipe/${membro.id}`)
      .send({ ativo: true })
      .expect(200);
    expect(await sessoesDe(membro.id)).toHaveLength(0);
  });

  it("remover da equipe derruba a sessão e deixa linha", async () => {
    const membro = await membroLogado();
    await admin.delete(`/api/lojas/${f.lojaId}/equipe/${membro.id}`).expect(204);

    // O vínculo já não existe, e o acesso não pode sobreviver a ele.
    expect(await sessoesDe(membro.id)).toHaveLength(0);
    const linhas = await trilhaDe("MEMBRO_REMOVIDO");
    expect(linhas.at(-1)!.entidadeId).toBe(membro.id);
  });

  it("convite criado e cancelado deixam linha — sem o token no detalhe", async () => {
    const email = `convidada-${randomUUID().slice(0, 8)}@teste.local`;
    const convite = await admin
      .post(`/api/lojas/${f.lojaId}/equipe/convites`)
      .send({ nome: "Convidada", email, perfilId: f.perfilId })
      .expect(201);

    const [criado] = await trilhaDe("CONVITE_CRIADO");
    expect(criado.entidadeId).toBe(convite.body.id);
    // O token no detalhe daria um link de entrada válido a quem lê a trilha.
    expect(JSON.stringify(criado.detalhe)).not.toContain(convite.body.token);

    await admin
      .delete(`/api/lojas/${f.lojaId}/equipe/convites/${convite.body.id}`)
      .expect(204);
    const [cancelado] = await trilhaDe("CONVITE_CANCELADO");
    expect(cancelado.detalhe).toMatchObject({ email });
  });

  it("a trilha do financeiro passa a mostrar as ações de administração", async () => {
    // O ponto do épico: o feed do E18 dizia "sem ações sensíveis" para quem só
    // administra, porque a união de ações era 100% financeira.
    const res = await admin
      .get(`/api/lojas/${f.lojaId}/financeiro/auditoria?acao=MEMBRO_ADICIONADO`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].acao).toBe("MEMBRO_ADICIONADO");
  });
});
