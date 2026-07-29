import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  auditLogTable,
  atendimentosTable,
  cabinesTable,
  db,
  leadsTable,
  parcelasTable,
  perfisTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { hojeLocal, inicioDoDia } from "@workspace/financeiro-core";
import {
  criarContrato,
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * O segundo lote da revisão: os DELETEs que não deixavam rastro, o dia da loja
 * que virava o dia do servidor, e a competência de comissão que sumia com quem
 * não fechou.
 */

describe("Apagar deixa de ser um clique sem rastro", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  /**
   * ANTES: `DELETE /leads/:leadId` era um delete cru — sem 404, sem contagem do
   * que ia junto e sem trilha, o oposto da régua que o E91 aplicou ao DELETE de
   * usuário e o E106 ao de loja. O cascade leva atendimento, orçamento,
   * interesse e registro de cobrança, e depois não há linha de onde
   * reconstituir quem foi apagada.
   */
  it("apagar a noiva grava na trilha o que foi junto — ANTES de sumir", async () => {
    const lead = await criarLead(f, { noivaNome: "Noiva Que Some" });

    await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}`).expect(204);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "LEAD_REMOVIDO"), eq(auditLogTable.entidadeId, lead.id)));
    expect(linha).toBeDefined();
    expect((linha.detalhe as { noivaNome: string }).noivaNome).toBe("Noiva Que Some");

    const restantes = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(restantes).toHaveLength(0);
  });

  it("noiva inexistente é 404, não 204 — quem chamou distingue os dois casos", async () => {
    await agent.delete(`/api/lojas/${f.lojaId}/leads/${randomUUID()}`).expect(404);
  });

  it("noiva COM contrato é recusada com 409 legível, não com o 23503 do banco", async () => {
    const lead = await criarLead(f);
    await criarContrato(f, { leadId: lead.id, valorTotal: 5000, fechadoEm: dataFutura(-5) });

    const r = await agent.delete(`/api/lojas/${f.lojaId}/leads/${lead.id}`).expect(409);
    expect(r.body.error).toBe("LEAD_COM_CONTRATO");
    expect(r.body.detalhe).toContain("contrato");
  });

  /**
   * ANTES: remover parcela apagava uma obrigação do carnê sem `registrarAuditoria`,
   * enquanto a operação ESPELHO do lado das contas a pagar ganhou
   * `CONTA_PAGAR_REMOVIDA` no E107 exatamente por esse motivo.
   */
  it("remover parcela grava PARCELA_REMOVIDA com o que ela valia", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 1200,
      fechadoEm: dataFutura(-5),
    });
    const criada = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas`)
      .send({ valorPrevisto: 1200, vencimento: dataFutura(10).toISOString(), descricao: "Única" })
      .expect(201);

    await agent.delete(`/api/lojas/${f.lojaId}/parcelas/${criada.body.id}`).expect(204);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.acao, "PARCELA_REMOVIDA"),
        eq(auditLogTable.entidadeId, criada.body.id),
      ));
    expect((linha.detalhe as { valorPrevisto: number }).valorPrevisto).toBe(1200);
    const sobrou = await db.select().from(parcelasTable).where(eq(parcelasTable.id, criada.body.id));
    expect(sobrou).toHaveLength(0);
  });

  /**
   * ANTES: `DELETE /admin/perfis/:perfilId` só recusava o perfil do sistema; um
   * perfil EM USO caía no 23503 e devolvia o `VINCULO_EXISTENTE` genérico — que
   * não diz se são pessoas, convites ou overrides, nem deixa próximo passo.
   */
  it("apagar perfil em uso é 409 dizendo QUEM depende dele", async () => {
    const r = await agent.delete(`/api/admin/perfis/${f.perfilId}`).expect(409);
    expect(r.body.error).toBe("PERFIL_EM_USO");
    expect(r.body.detalhe).toContain("pessoa");

    const [vivo] = await db.select().from(perfisTable).where(eq(perfisTable.id, f.perfilId));
    expect(vivo).toBeDefined();
  });

  it("perfil sem ninguém continua sendo apagável", async () => {
    const perfilId = randomUUID();
    await db.insert(perfisTable).values({
      id: perfilId,
      nome: `Perfil Solto ${perfilId.slice(0, 8)}`,
      acessosModulos: { leads: true },
    });
    await agent.delete(`/api/admin/perfis/${perfilId}`).expect(204);
  });
});

describe("O dia é o da LOJA, também no dashboard", () => {
  let f: Fixture;

  afterAll(async () => {
    await limparFixture(f);
  });

  /**
   * ANTES: o contador de "atendimentos de hoje" recortava o dia com
   * `setHours(0,0,0,0)` — a meia-noite do relógio do PROCESSO, que no container
   * é UTC —, enquanto o "a receber" do MESMO handler já usava `hojeLocal()`. O
   * atendimento das 22h de São Paulo é 01h UTC do dia seguinte: ele contava no
   * dia errado, no mesmo painel em que o número ao lado falava do dia certo.
   */
  it("o atendimento das 22h de hoje conta HOJE", async () => {
    f = await criarFixture();
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: cabineId });
    await db.insert(atendimentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: lead.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      inicio: new Date(`${hojeLocal()}T22:00:00-03:00`),
    });

    const r = await agent.get(`/api/lojas/${f.lojaId}/dashboard`).expect(200);
    expect(r.body.atendimentosHoje).toBe(1);
  });

  it("e o de ontem às 22h NÃO conta hoje", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f);
    const cabineId = randomUUID();
    await db.insert(cabinesTable).values({ id: cabineId, lojaId: f.lojaId, nome: cabineId });
    const ontem = new Date(inicioDoDia(hojeLocal()).getTime() - 2 * 3_600_000);
    await db.insert(atendimentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      leadId: lead.id,
      cabineId,
      vendedoraId: f.vendedoraId,
      inicio: ontem,
    });

    const r = await agent.get(`/api/lojas/${f.lojaId}/dashboard`).expect(200);
    expect(r.body.atendimentosHoje).toBe(1);
  });
});

describe("A data do contrato não muda sem passar pelas provas", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /**
   * ANTES: o PATCH gravava `...parsed.data` direto, sem NENHUMA das duas provas
   * que o POST faz sobre `dataCasamento` — a coerência com a reserva e a
   * disponibilidade da peça. Fechar o contrato para 10/05 e mover a data por
   * aqui era o caminho aberto para o mesmo estrago que a criação recusa.
   */
  it("mover a data do casamento para longe da reserva é 422", async () => {
    const { criarBloqueio, criarVestido } = await import("./helpers");
    const lead = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: (await criarVestido(f)).id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 8000,
        bloqueioVestidoIds: [bloqueio.id],
        dataCasamento: dataFutura(90).toISOString(),
      })
      .expect(201);

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .send({ dataCasamento: dataFutura(120).toISOString() })
      .expect(422);
    expect(r.body.error).toBe("DATA_DIVERGE_DA_RESERVA");
  });

  it("mudar outros campos — e a data COERENTE — continua passando", async () => {
    const { criarBloqueio, criarVestido } = await import("./helpers");
    const lead = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: (await criarVestido(f)).id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(60),
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 4000,
        bloqueioVestidoIds: [bloqueio.id],
      })
      .expect(201);

    await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .send({ observacoes: "combinado por telefone" })
      .expect(200);
    await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .send({ dataCasamento: dataFutura(60).toISOString() })
      .expect(200);
  });
});
