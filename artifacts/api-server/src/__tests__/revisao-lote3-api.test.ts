import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, leadsTable, orcamentosTable, usuariosLojasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  criarContrato,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("Competência parcialmente fechada não some com ninguém", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    // Escada para as DUAS pessoas da fixture: a vendedora e o superadmin, que
    // aqui é só mais uma pessoa da loja que vende.
    for (const vendedoraId of [f.vendedoraId, f.superAdminId]) {
      await agent
        .post(`/api/lojas/${f.lojaId}/comissao/regras`)
        .send({
          vendedoraId,
          vigenciaInicio: dia("2020-01-01").toISOString(),
          faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 5 }],
        })
        .expect(201);
    }
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  /**
   * ANTES: `linhasDaCompetencia` decidia "competência fechada, resposta
   * imutável" com `if (fechamentosDaComp.length > 0)` — a granularidade por
   * COMPETÊNCIA que `lib/comissao.ts:249-263` já documenta como errada. Bastava
   * UMA vendedora fechada para a resposta virar a lista de fechamentos, e quem
   * vendeu no mês sem ter fechamento sumia do preview e do ranking, levando o
   * estorno pendente junto.
   */
  it("quem vendeu depois do fechamento da colega continua aparecendo no preview", async () => {
    const leadA = await criarLead(f);
    await criarContrato(f, {
      leadId: leadA.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 10000,
      fechadoEm: dia("2025-03-10"),
    });

    // Março fecha — só a vendedora tem venda até aqui.
    const fechado = await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-03" })
      .expect(201);
    expect(fechado.body).toHaveLength(1);

    // E DEPOIS entra uma venda de março da outra pessoa (contrato lançado
    // retroativamente — o caso que a granularidade errada escondia).
    const leadB = await criarLead(f);
    await criarContrato(f, {
      leadId: leadB.id,
      vendedoraId: f.superAdminId,
      valorTotal: 6000,
      fechadoEm: dia("2025-03-20"),
    });

    const previa = await agent
      .get(`/api/lojas/${f.lojaId}/comissao/preview`)
      .query({ competencia: "2025-03" })
      .expect(200);

    const ids = previa.body.map((l: { vendedoraId: string }) => l.vendedoraId).sort();
    expect(ids).toEqual([f.superAdminId, f.vendedoraId].sort());
    // A memória de quem fechou continua sendo a memória; quem faltou vem ao vivo.
    const aoVivo = previa.body.find((l: { vendedoraId: string }) => l.vendedoraId === f.superAdminId);
    expect(aoVivo.totalVendas).toBe(6000);
    expect(aoVivo.valorTotal).toBe(300);
  });

  it("com TODO mundo fechado, a resposta continua sendo a memória", async () => {
    await agent
      .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
      .send({ competencia: "2025-03" })
      .expect(201);

    const previa = await agent
      .get(`/api/lojas/${f.lojaId}/comissao/preview`)
      .query({ competencia: "2025-03" })
      .expect(200);
    expect(previa.body).toHaveLength(2);
    // Mês fechado não persegue degrau nem projeta futuro.
    for (const linha of previa.body) {
      expect(linha.faltaProximoDegrau).toBeNull();
      expect(linha.projecao).toBeNull();
    }
  });
});

describe("O aceite da noiva não inventa a hora dele", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
  });

  /**
   * ANTES: perdida a corrida do UPDATE condicional, a função devolvia `agora` —
   * o instante DESTA requisição — em vez do `aceitoEm` que ficou gravado. O
   * aceite é o carimbo que a noiva vê ("aceito em ..."), e duas abas liam horas
   * diferentes para o MESMO fato; nenhuma das duas batia com o banco.
   */
  it("dois aceites simultâneos devolvem o MESMO instante, e é o do banco", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "ENVIADO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 1000 });

    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const link = await agent
      .post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`)
      .expect(200);
    const token = link.body.token as string;

    const [a, b] = await Promise.all([
      request(app).post(`/api/orcamentos/publico/aceite?token=${token}`).send({}),
      request(app).post(`/api/orcamentos/publico/aceite?token=${token}`).send({}),
    ]);

    const respostas = [a, b].filter((r) => r.status === 200);
    expect(respostas.length).toBeGreaterThan(0);

    const [gravado] = await db
      .select({ aceitoEm: orcamentosTable.aceitoEm })
      .from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamento.id));
    expect(gravado.aceitoEm).not.toBeNull();

    for (const r of respostas) {
      expect(new Date(r.body.aceitoEm).getTime()).toBe(gravado.aceitoEm!.getTime());
    }
  });
});

describe("O expurgo LGPD conta os meses sem transbordar", () => {
  let f: Fixture;

  afterAll(async () => {
    await limparFixture(f);
  });

  /**
   * ANTES: `corte.setMonth(corte.getMonth() - meses)` transborda quando o dia de
   * hoje não existe no mês alvo — rodado em 31/03 com 1 mês, o corte vira 03/03,
   * três dias no FUTURO. O expurgo anonimiza a noiva de forma irreversível por
   * desenho; um corte que anda para a frente anonimiza ficha que ainda estava
   * dentro do prazo de retenção. `addMeses` grampeia ao último dia do mês curto.
   *
   * Aqui a prova é de contrato, não de calendário: a noiva atualizada HOJE
   * jamais entra num expurgo de 1 mês, em nenhum dia do ano.
   */
  it("noiva mexida hoje não entra no expurgo de seis meses", async () => {
    f = await criarFixture();
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    const lead = await criarLead(f, { etapa: "PERDIDO", noivaNome: "Recente" });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/leads/expurgo`)
      .send({ mesesInatividade: 6 })
      .expect(200);
    expect(r.body.anonimizadas).toBe(0);

    const [viva] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(viva.noivaNome).toBe("Recente");
  });

  it("a noiva PERDIDA e parada há sete meses é anonimizada — a régua continua valendo", async () => {
    const agent = await loginComLoja(f.superAdminEmail, f.lojaId);
    // `perdidaEm` é o relógio da inatividade — o corte olha para ele.
    const lead = await criarLead(f, {
      etapa: "PERDIDO",
      noivaNome: "Antiga",
      perdidaEm: new Date(Date.now() - 210 * 86_400_000),
    });

    await agent
      .post(`/api/lojas/${f.lojaId}/leads/expurgo`)
      .send({ mesesInatividade: 6 })
      .expect(200);

    const [depois] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(depois.noivaNome).toBe("(anonimizada)");
  });
});

describe("O vínculo e o override saem numa consulta só", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  // O `leftJoin` substituiu duas consultas sequenciais no caminho mais quente do
  // servidor. O que não pode mudar é o RESULTADO: override substitui o template.
  it("sem override, valem os acessos do perfil", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.acessosModulos.leads.ver).toBe(true);
    expect(me.body.acessosModulos.financeiro.ver).toBe(false);
  });

  it("com override, ele SUBSTITUI o template — não se mistura", async () => {
    const admin = await loginComLoja(f.superAdminEmail, f.lojaId);
    await admin
      .put(`/api/admin/lojas/${f.lojaId}/overrides`)
      .send({
        perfilId: f.perfilId,
        acessosModulos: { financeiro: { ver: true, criar: false, editar: false } },
      })
      .expect(200);

    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.acessosModulos.financeiro.ver).toBe(true);
    // `leads` não estava no override: some, porque override não se mistura.
    expect(me.body.acessosModulos.leads.ver).toBe(false);

    // E o vínculo continua sendo o que decide quem entra na loja.
    const [vinculo] = await db
      .select()
      .from(usuariosLojasTable)
      .where(eq(usuariosLojasTable.usuarioId, f.vendedoraId));
    expect(vinculo.perfilId).toBe(f.perfilId);
  });
});
