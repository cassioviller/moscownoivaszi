import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, contratosTable, comissaoRegrasTable, comissaoFaixasTable, usuariosTable, usuariosLojasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { competenciaDe, competenciasAnteriores, limitesCompetencia } from "../lib/comissao";
import { hashSenha } from "../lib/auth";
import { criarFixture, criarLead, fecharPool, limparFixture, loginComLoja, SENHA_TESTE, type Fixture } from "./helpers";

/**
 * E55 — a colocação no extrato pessoal. O ranking já existia, atrás do gate de
 * gestão: a vendedora não podia ver onde está sem ganhar acesso a quanto todo
 * mundo ganha.
 *
 * O que precisa de prova é a PRIVACIDADE (o extrato não pode carregar valor de
 * ninguém) e a coerência com o ranking da gestão — posições diferentes nas
 * duas telas seriam pior que não ter posição.
 */
describe("Colocação no extrato pessoal (E55)", () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<typeof loginComLoja>>;
  let segunda: { id: string; email: string };

  const ATUAL = competenciaDe(new Date());
  const [PASSADA] = competenciasAnteriores(ATUAL, 1);

  async function escadaDe(vendedoraId: string) {
    const regraId = randomUUID();
    await db.insert(comissaoRegrasTable).values({
      id: regraId,
      lojaId: f.lojaId,
      vendedoraId,
      vigenciaInicio: new Date("2020-01-01T12:00:00-03:00"),
      bonusAcumulaFaixas: false,
    });
    await db.insert(comissaoFaixasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      regraId,
      minAcumulado: 0,
      maxAcumulado: null,
      percentual: 10,
      bonusFixo: null,
    });
  }

  /** Contrato ATIVO da vendedora, com `fechadoEm` na competência pedida. */
  async function venderEm(vendedoraId: string, competencia: string, valorTotal: number) {
    const lead = await criarLead(f);
    const res = await admin
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId, valorTotal })
      .expect(201);
    const { inicio } = limitesCompetencia(competencia);
    await db
      .update(contratosTable)
      .set({ fechadoEm: new Date(inicio.getTime() + 5 * 86_400_000) })
      .where(eq(contratosTable.id, res.body.id));
  }

  beforeAll(async () => {
    f = await criarFixture();
    admin = await loginComLoja(f.superAdminEmail, f.lojaId);

    // Uma segunda pessoa na loja: sem ela não há ranking a testar.
    const sufixo = randomUUID().slice(0, 8);
    segunda = { id: randomUUID(), email: `segunda-${sufixo}@teste.local` };
    await db.insert(usuariosTable).values({
      id: segunda.id,
      nome: `Segunda Vendedora ${sufixo}`,
      email: segunda.email,
      senhaHash: await hashSenha(SENHA_TESTE),
    });
    await db.insert(usuariosLojasTable).values({
      usuarioId: segunda.id,
      lojaId: f.lojaId,
      perfilId: f.perfilId,
    });

    await escadaDe(f.superAdminId);
    await escadaDe(segunda.id);
  });

  afterAll(async () => {
    await db.delete(usuariosTable).where(eq(usuariosTable.id, segunda.id));
    await limparFixture(f);
    await fecharPool();
  });

  const meuExtrato = (agent: Awaited<ReturnType<typeof loginComLoja>>, competencia: string) =>
    agent.get(`/api/lojas/${f.lojaId}/minha-comissao?competencia=${competencia}`);

  it("sozinha na competência não é ranking — não há colocação a dar", async () => {
    await venderEm(f.superAdminId, ATUAL, 10_000);
    const res = await meuExtrato(admin, ATUAL).expect(200);
    // "1º de 1" é ruído com cara de conquista.
    expect(res.body.colocacao ?? null).toBeNull();
  });

  it("com duas pessoas, cada uma vê a própria posição — e só ela", async () => {
    await venderEm(segunda.id, ATUAL, 30_000);
    const outraAgent = await loginComLoja(segunda.email, f.lojaId);

    const minha = await meuExtrato(admin, ATUAL).expect(200);
    const dela = await meuExtrato(outraAgent, ATUAL).expect(200);

    expect(minha.body.colocacao).toEqual({ posicao: 2, de: 2 });
    expect(dela.body.colocacao).toEqual({ posicao: 1, de: 2 });

    // A PRIVACIDADE: o corpo inteiro não pode conter o valor da colega. 3.000
    // é a comissão dela (10% de 30.000); 30.000 é a venda.
    const cru = JSON.stringify(minha.body);
    expect(cru).not.toContain("30000");
    expect(cru).not.toContain('"vendedoraNome"');
    expect(minha.body.totalVendas).toBe(10_000);
  });

  it("a posição bate com o ranking que a gestão vê", async () => {
    const [meu, preview] = await Promise.all([
      meuExtrato(admin, ATUAL).expect(200),
      admin.get(`/api/lojas/${f.lojaId}/comissao/preview?competencia=${ATUAL}`).expect(200),
    ]);
    const ordem = preview.body.map((l: { vendedoraId: string }) => l.vendedoraId);
    // Posições diferentes nas duas telas seriam pior que não ter posição.
    expect(ordem.indexOf(f.superAdminId) + 1).toBe(meu.body.colocacao.posicao);
    expect(ordem).toHaveLength(meu.body.colocacao.de);
  });

  it("empate compartilha a colocação", async () => {
    // Iguala as duas em PASSADA: 20 mil cada.
    await venderEm(f.superAdminId, PASSADA, 20_000);
    await venderEm(segunda.id, PASSADA, 20_000);
    const outraAgent = await loginComLoja(segunda.email, f.lojaId);

    const minha = await meuExtrato(admin, PASSADA).expect(200);
    const dela = await meuExtrato(outraAgent, PASSADA).expect(200);

    // Desempatar por um critério invisível faria a segunda achar que perdeu
    // por um motivo que ninguém sabe explicar.
    expect(minha.body.colocacao).toEqual({ posicao: 1, de: 2 });
    expect(dela.body.colocacao).toEqual({ posicao: 1, de: 2 });
  });

  it("quem não vendeu no mês não tem colocação", async () => {
    const semVenda = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const res = await semVenda.get(`/api/lojas/${f.lojaId}/minha-comissao?competencia=${ATUAL}`).expect(200);
    // Aparecer como "3º de 3" sem ter vendido seria inventar uma disputa.
    expect(res.body.colocacao ?? null).toBeNull();
  });
});
