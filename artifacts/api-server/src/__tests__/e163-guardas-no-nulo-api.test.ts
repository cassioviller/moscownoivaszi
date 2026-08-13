import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, orcamentosTable, parcelasTable, contratosTable, contratoBloqueiosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { pdfDoContrato } from "../lib/contrato-do-papel";
import { temDesconto } from "@workspace/financeiro-core";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E163 — as guardas que se desligam no nulo.
 *
 * A segunda família que a revisão nomeou (a primeira é check-then-write): a
 * guarda existe, está certa para o caso preenchido, e **um campo nulo a
 * desliga em silêncio** — MANUTENCAO sem `casamentoData` desligava a prova de
 * data do E150 (K4), bloqueio manual sem data desligava a prova do PATCH (K5),
 * `aceiteHash` nulo desligava o gate do E115 inteiro (C7/O5), `leadId` nulo
 * desligava a guarda de dono da avaria com o dono a um join de distância (V3),
 * e `descontoValor 0` tinha uma leitura no dinheiro e outra no papel (P15).
 */
describe("E163 — as guardas que se desligavam no nulo", () => {
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

  // ─────────── K4 — MANUTENCAO não é reserva (decisão D2) ────────────────────

  it("K4/D2 · janela de manutenção não satisfaz o E150: 422, e não o dobro-prometido", async () => {
    const noiva = await criarLead(f);
    const vestido = await criarVestido(f);
    const orcamento = await criarOrcamento(f, { leadId: noiva.id, status: "APROVADO" });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "VESTIDO",
      vestidoId: vestido.id,
      valorUnitario: 4000,
    });
    // A janela de manutenção: 5 dias, sem casamentoData — o que desligava a
    // guarda de data e entrava em `vestidosReservados` como reserva.
    const manutencao = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "MANUTENCAO",
      casamentoData: null,
      inicio: dataFutura(30),
      fim: dataFutura(35),
    });

    /**
     * VERMELHO ANTES: 201. **Medido no achado:** venda de R$ 4.000,00
     * satisfeita pela janela de manutenção de março, outra de R$ 4.000,00 com
     * reserva legítima de maio — dois contratos, R$ 8.000,00, o MESMO vestido
     * no mesmo sábado. A decisão da dona (D2): o gate exige RESERVA_CASAMENTO.
     */
    const r = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: noiva.id,
      vendedoraId: f.vendedoraId,
      orcamentoId: orcamento.id,
      valorTotal: 4000,
      bloqueioVestidoIds: [manutencao.id],
      dataCasamento: dataFutura(180),
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("BLOQUEIO_NAO_E_RESERVA");
  });

  // ─────────── K5 — a prova de data do PATCH não se desliga no nulo ──────────

  it("K5 · bloqueio manual sem data: mover o contrato para um dia ocupado é 409", async () => {
    const noiva = await criarLead(f);
    const vestido = await criarVestido(f);
    /**
     * O CHECK `bloqueio_vestidos_reserva_exige_casamento_data` (descoberto ao
     * escrever este teste — a primeira versão tentou RESERVA_CASAMENTO nula e
     * o banco recusou com 23514) prova que o cenário do K5 só existe pela
     * janela LEGADA: um contrato de antes do D2 preso a um bloqueio de
     * MANUTENCAO (o único tipo que vive sem `casamentoData`). O K4 fechou a
     * porta de entrada; esta guarda cobre quem já estava dentro — e o estado
     * entra pelo banco porque a rota, com razão, não o cria mais.
     */
    const manual = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "MANUTENCAO",
      casamentoData: null,
      leadId: noiva.id,
      inicio: dataFutura(60),
      fim: dataFutura(65),
    });
    const contratoId = randomUUID();
    await db.insert(contratosTable).values({
      id: contratoId,
      lojaId: f.lojaId,
      leadId: noiva.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
      status: "ATIVO",
    });
    await db.insert(contratoBloqueiosTable).values({ contratoId, bloqueioId: manual.id });
    const criado = { body: { id: contratoId } };

    // Outra noiva segura a MESMA peça num sábado distante.
    const outraNoiva = await criarLead(f);
    const dataDaOutra = dataFutura(200);
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataDaOutra,
      leadId: outraNoiva.id,
    });

    /**
     * VERMELHO ANTES: 200 — o contrato passava a prometer o dia da outra noiva
     * com o envelope físico sem cobrir o dia, porque a única guarda do PATCH
     * (`bloqueio.casamentoData && ...`) se desligava no nulo, e o comentário
     * afirmava repetir "as duas provas que o POST faz".
     */
    const mover = await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .send({ dataCasamento: dataDaOutra });
    expect(mover.status).toBe(409);
    expect(mover.body.error).toBe("VESTIDO_INDISPONIVEL");
    expect(mover.body.conflitos.length).toBeGreaterThan(0);

    // Limpeza: o contrato deste teste não pode prender o índice parcial.
    await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, criado.body.id));
  });

  // ─────────── C7/O5 — o gate confere SEMPRE que há versão ──────────────────

  it("C7/O5 · o /aprovar manual carimba o hash da versão vigente, e o vivo divergente leva 422", async () => {
    const noiva = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: noiva.id, status: "RASCUNHO" });
    const item = await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });
    // O link congela a v1 de R$ 5.000,00 — é o que a noiva vê.
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`).expect(200);

    // O vivo diverge enquanto ENVIADO (o E75 permite de propósito).
    await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/itens/${item.id}`)
      .send({ valorUnitario: 5500 })
      .expect(200);

    // A vendedora aprova À MÃO — o caminho comum que deixava o hash nulo.
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/aprovar`).expect(204);

    const [aprovado] = await db.select().from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamento.id));
    // VERMELHO ANTES: aceiteHash nulo — e o gate do E115 pulado inteiro.
    expect(aprovado.aceiteHash).not.toBeNull();
    expect(aprovado.aceiteVersao).toBe(1);

    /**
     * VERMELHO ANTES: 201 — a página da noiva afirmava R$ 5.000,00 aprovado e
     * o contrato nascia dos itens vivos em R$ 5.500,00, sem 422 em porta
     * nenhuma. É exatamente o caso que o comentário do E115 diz existir para
     * impedir.
     */
    const r = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: noiva.id,
      vendedoraId: f.vendedoraId,
      orcamentoId: orcamento.id,
      valorTotal: 5500,
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("ORCAMENTO_DIVERGE_DO_ACEITE");
  });

  it("C7/O5 · sem divergência, a aprovação manual fecha contrato normalmente", async () => {
    const noiva = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: noiva.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/link`).expect(200);
    await agent.post(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}/aprovar`).expect(204);

    const r = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: noiva.id,
      vendedoraId: f.vendedoraId,
      orcamentoId: orcamento.id,
      valorTotal: 5000,
    });
    expect(r.status).toBe(201);
    await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, r.body.id));
  });

  // ─────────── V3 — o dono existe e passa a ser perguntado ───────────────────

  it("V3 · avaria em bloqueio sem noiva MAS com reserva: o reparo não cai no carnê da errada", async () => {
    // A dona de verdade, pela reserva (lead_id NOT NULL).
    const dona = await criarLead(f);
    const vestido = await criarVestido(f);
    const reserva = await criarReserva(f, { leadId: dona.id, casamentoData: dataFutura(120) });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(120),
      leadId: null, // S-C10: o caso POSSÍVEL — 0 de 116 em `moscow_base`, 2 de 127 no dev
      reservaId: reserva.id,
    });
    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Rasgo na renda", custoReparo: 1500 });
    expect(avaria.status).toBe(201);

    // O contrato da OUTRA noiva.
    const outraNoiva = await criarLead(f);
    const contratoDaOutra = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: outraNoiva.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 3000,
    });
    expect(contratoDaOutra.status).toBe(201);

    /**
     * VERMELHO ANTES: 201 — R$ 1.500,00 de reparo caíam no carnê da noiva B
     * por um dano que ela não causou, e o extrato do portal dela mostrava a
     * cobrança. O dono existia (reservas.lead_id é NOT NULL) e nunca era
     * perguntado.
     */
    const cobrar = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
      .send({ contratoId: contratoDaOutra.body.id });
    expect(cobrar.status).toBe(422);
    expect(cobrar.body.error).toBe("AVARIA_DE_OUTRA_NOIVA");

    // E no contrato da DONA (via reserva), cobra normalmente.
    const contratoDaDona = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: dona.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 4000,
      bloqueioVestidoIds: [bloqueio.id],
      dataCasamento: dataFutura(120),
    });
    expect(contratoDaDona.status).toBe(201);
    const cobrarCerto = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
      .send({ contratoId: contratoDaDona.body.id });
    expect(cobrarCerto.status).toBe(201);
  });

  // ─────────── P15 — o desconto zero tem UMA leitura ─────────────────────────

  it("P15 · `descontoValor 0` é SEM desconto na régua única — e o papel para de imprimir R$ 0,00", () => {
    // A régua, nos quatro cantos do domínio dela.
    expect(temDesconto("VALOR", 0)).toBe(false);
    expect(temDesconto("PERCENTUAL", 0)).toBe(false);
    expect(temDesconto(null, 100)).toBe(false);
    expect(temDesconto("VALOR", 100)).toBe(true);

    const base = {
      id: "c1",
      lojaId: "l1",
      leadId: "n1",
      valorTotal: 4000,
      loja: { nome: "Moscow Noivas" },
      lead: { noivaNome: "Ana" },
      parcelas: [],
      itens: [
        { tipo: "VESTIDO", descricao: "Vestido", valorUnitario: 4000, quantidade: 1 },
      ],
    };

    /**
     * VERMELHO ANTES: o papel olhava só `descontoTipo` e imprimia
     * "Desconto − R$ 0,00" num contrato que a régua do dinheiro
     * (`liquidoEmCentavos`, `!valor`) trata como SEM desconto — o mesmo
     * registro, dois arquivos, duas respostas.
     */
    const comZero = Buffer.from(
      pdfDoContrato({ ...base, descontoTipo: "VALOR", descontoValor: 0 } as never),
    ).toString("latin1");
    expect(comZero).not.toContain("Desconto");

    const comDesconto = Buffer.from(
      pdfDoContrato({ ...base, valorTotal: 3900, descontoTipo: "VALOR", descontoValor: 100 } as never),
    ).toString("latin1");
    expect(comDesconto).toContain("Desconto");
  });
});
