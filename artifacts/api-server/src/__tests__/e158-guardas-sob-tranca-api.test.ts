import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, auditLogTable, leadsTable, parcelasTable, contratosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarBloqueio,
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
 * E158 — em `contratos.ts`, TODA guarda relê sob a tranca.
 *
 * As varreduras anteriores acertaram o padrão e erraram o alcance: a S-M7
 * fechou a reserva exclusiva do POST, a S-M22 fechou o DELETE de parcela, a
 * S-M24 fechou o estado terminal em algumas portas. O que ficou fora da
 * enumeração continuou lendo no pool e escrevendo sem reconferência — e a
 * revisão pela ótica dos papéis achou mais SETE portas neste arquivo, todas
 * com o mesmo desfecho medido: dinheiro que fica no caixa depois de declarado
 * devolvido, ou peça prometida duas vezes.
 *
 * As corridas aqui são DETERMINÍSTICAS, no molde do
 * `sm7-corrida-reserva-exclusiva-api.test.ts:64-91`: uma segunda conexão
 * segura uma escrita NÃO COMMITADA, a rota fica pendurada na tranca, e o
 * commit do concorrente acontece depois. Nenhum `sleep` de sorte decide o
 * resultado — o que decide é quem tem a tranca.
 *
 * A ordem das trancas do módulo é **lead → contrato → parcelas → bloqueios**,
 * e é ela que impede que estas portas se matem em deadlock.
 */
describe("E158 — as guardas de contratos.ts relidas sob a tranca", () => {
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

  /** Um contrato ATIVO com carnê de duas parcelas, pela própria rota. */
  async function contratoComCarne(valorTotal = 1000) {
    const lead = await criarLead(f);
    const metade = valorTotal / 2;
    const resposta = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal,
      parcelas: [
        { numero: 1, valorPrevisto: metade, vencimento: dataFutura(30) },
        { numero: 2, valorPrevisto: metade, vencimento: dataFutura(60) },
      ],
    });
    expect(resposta.status).toBe(201);
    return { lead, contrato: resposta.body as { id: string; parcelas: { id: string; numero: number }[] } };
  }

  // ─────────────────── E245/B8 — o que a tranca lê é o que o instrumento congela ───────

  /**
   * **E245 (B8 da conferência) — a qualificação vem do lead SOB a tranca.** O
   * `POST /contratos` trancava a linha do lead (K3) lendo só o `id`, e a
   * qualificação que o instrumento congela (E215) vinha do `lead` do POOL, lido
   * antes: o CPF que a recepção corrigiu no meio entrava VELHO no papel — o
   * documento assinado com o número errado. Mesmo formato na rescisão: o
   * `sobTranca` do cancelar relia só `status`, e `calcularRescisao` decidia com
   * `valorTotal`/`prazoDevolucaoReservaDias`/`dataRetirada` do pool.
   */
  it("E245/B8 · a recepção corrige o CPF em voo: o contrato congela o CPF NOVO, não o do pool", async () => {
    const lead = await criarLead(f);
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query(`UPDATE leads SET cpf = '529.982.247-25' WHERE id = $1`, [lead.id]);
      const postP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
          leadId: lead.id,
          vendedoraId: f.vendedoraId,
          valorTotal: 1000,
          parcelas: [{ numero: 1, valorPrevisto: 1000, vencimento: dataFutura(30) }],
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");
      const r = await postP;
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      // ANTES: "390.533.447-05" — o CPF da fixture, lido no pool antes da tranca.
      const [gravado] = await db.select({ cpf: contratosTable.cpf }).from(contratosTable).where(eq(contratosTable.id, r.body.id));
      expect(gravado!.cpf).toBe("529.982.247-25");
    } finally {
      await cliente.query("ROLLBACK").catch(() => {});
      cliente.release();
    }
  });

  // ─────────────────── K1/P1 — o dinheiro que escapava do cancelamento ───────

  it("K1/P1 · o Pix que entra na janela do cancelamento NÃO sobrevive com o dinheiro dentro", async () => {
    const { contrato } = await contratoComCarne(1400);
    const parcela = contrato.parcelas.find((p) => p.numero === 1)!;

    const cliente = await pool.connect();
    try {
      // O recebimento de R$ 700,00 em voo: a linha da parcela está trancada e
      // ainda não commitou. O cancelamento lia esta parcela no POOL — via
      // PREVISTA com `valor_recebido` nulo — e seguia em frente.
      await cliente.query("BEGIN");
      await cliente.query(
        `UPDATE parcelas SET status = 'PAGA', valor_recebido = 700, recebido_em = now() WHERE id = $1`,
        [parcela.id],
      );

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`).send({
          motivo: "Noiva desistiu",
          destinoPago: "estornar",
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      const resposta = await respostaP;
      expect(resposta.status).toBe(200);
    } finally {
      cliente.release();
    }

    /**
     * VERMELHO ANTES: a parcela ficava `PAGA` com `valorRecebido: 700` VIVA num
     * contrato CANCELADO — `entrouDinheiro` (`caixa.ts:82`) a contava no caixa
     * realizado para sempre, e sem volta (`POST /estornar` exige contrato
     * ATIVO). PAGA escapa de `STATUS_ABERTO` e o id escapava de
     * `idsComRecebimento`, que foi montado quando o valor ainda era nulo.
     */
    const [depois] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcela.id));
    expect(depois.status).toBe("CANCELADA");
    expect(depois.valorRecebido).toBeNull();

    // E a trilha declara o que realmente foi estornado. VERMELHO ANTES:
    // `totalRecebido: 0` e `totalEstornado: 0` sobre R$ 700,00 devolvidos.
    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "CONTRATO_CANCELADO"), eq(auditLogTable.entidadeId, contrato.id)));
    const detalhe = trilha.detalhe as Record<string, unknown>;
    expect(detalhe.totalRecebido).toBe(700);
    expect(detalhe.totalEstornado).toBe(700);
    expect(detalhe.parcelasEstornadas).toBe(1);
  });

  // ─────────────────── K3 — dois cliques em "gerar contrato" ─────────────────

  it("K3/A08.1 · o segundo clique perde na tranca do lead: 409, um contrato ativo só", async () => {
    const noiva = await criarLead(f);
    const vencedorId = randomUUID();

    const cliente = await pool.connect();
    try {
      // O contrato da colega, ainda não commitado. O INSERT toma FOR KEY SHARE
      // na linha do LEAD (a FK), que conflita com o FOR UPDATE da rota.
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO contratos (id, loja_id, lead_id, vendedora_id, valor_total)
         VALUES ($1, $2, $3, $4, 5000)`,
        [vencedorId, f.lojaId, noiva.id, f.vendedoraId],
      );

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
          leadId: noiva.id,
          vendedoraId: f.vendedoraId,
          valorTotal: 5000,
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 201 — dois contratos ATIVOS de R$ 5.000,00 para a mesma
       * noiva, a ficha somando R$ 10.000,00 a receber sobre uma venda de
       * R$ 5.000,00, com a comissão fechando sobre o dobro.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("CONTRATO_ATIVO_DUPLICADO");
    } finally {
      cliente.release();
    }

    const ativos = await db
      .select({ id: contratosTable.id })
      .from(contratosTable)
      .where(and(eq(contratosTable.leadId, noiva.id), eq(contratosTable.status, "ATIVO")));
    expect(ativos).toHaveLength(1);
  });

  // ─────────────────── K2 — a reserva que morre durante a montagem ───────────

  it("K2 · a reserva cancelada na janela NÃO vira contrato: 409, e não uma venda presa a reserva morta", async () => {
    const noiva = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(150),
    });

    const cliente = await pool.connect();
    try {
      // O cancelamento do contrato que segurava a peça soft-cancela o bloqueio
      // (`contratos.ts:993`). Em voo, ele tranca a linha do bloqueio.
      await cliente.query("BEGIN");
      await cliente.query("UPDATE bloqueio_vestidos SET cancelado_em = now() WHERE id = $1", [bloqueio.id]);

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
          leadId: noiva.id,
          vendedoraId: f.vendedoraId,
          valorTotal: 9000,
          bloqueioVestidoIds: [bloqueio.id],
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 201. A reconferência sob `FOR UPDATE` relia só `id` e
       * refazia só a prova de `presosPorContratoAtivo` — `canceladoEm` ficava
       * de fora. O contrato nascia preso a uma reserva morta, que
       * `verificarDisponibilidade` ignora e a EXCLUDE também: o mesmo vestido
       * saía vendido de novo para o mesmo sábado, R$ 9.000,00 prometidos sobre
       * uma peça, descobertos na retirada.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("RESERVA_CANCELADA");
    } finally {
      cliente.release();
    }

    const contratos = await db
      .select({ id: contratosTable.id })
      .from(contratosTable)
      .where(eq(contratosTable.leadId, noiva.id));
    expect(contratos).toHaveLength(0);
  });

  // ─────────────────── K7 — o estorno num contrato que caiu no meio ──────────

  it("K7 · o estorno perde para o cancelamento em voo: 422, e o sinal NÃO volta a ser cobrável", async () => {
    const { contrato } = await contratoComCarne(2000);
    const parcela = contrato.parcelas.find((p) => p.numero === 1)!;
    await db
      .update(parcelasTable)
      .set({ status: "PAGA", valorRecebido: 1000, recebidoEm: new Date() })
      .where(eq(parcelasTable.id, parcela.id));

    const cliente = await pool.connect();
    try {
      // O cancelamento com `destinoPago: "manter"` em voo: ele NÃO toca a
      // parcela PAGA (ela não está em STATUS_ABERTO), então a condição de
      // status da parcela no UPDATE do estorno continuava casando.
      await cliente.query("BEGIN");
      await cliente.query("UPDATE contratos SET status = 'CANCELADO', cancelado_em = now() WHERE id = $1", [
        contrato.id,
      ]);

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`).send({}),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200 — a parcela voltava a PREVISTA num contrato morto.
       * R$ 1.000,00 de sinal saíam do caixa realizado e reapareciam como
       * cobrança ABERTA de uma venda que não existe: no horizonte, no aging e
       * na régua que liga para a noiva pedir o dinheiro.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("CONTRATO_NAO_ATIVO");
    } finally {
      cliente.release();
    }

    const [depois] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcela.id));
    expect(depois.status).toBe("PAGA");
    expect(Number(depois.valorRecebido)).toBe(1000);
  });

  // ─────────────────── P4 — o perdedor que virava 500 ────────────────────────

  it("P4 · o estorno cuja parcela sumiu na janela devolve 404, e não 'não consegui falar com o sistema'", async () => {
    const { contrato } = await contratoComCarne(600);
    const parcela = contrato.parcelas.find((p) => p.numero === 1)!;
    await db
      .update(parcelasTable)
      .set({ status: "PAGA", valorRecebido: 300, recebidoEm: new Date() })
      .where(eq(parcelasTable.id, parcela.id));

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("DELETE FROM parcelas WHERE id = $1", [parcela.id]);

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela.id}/estornar`).send({}),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 500. O `atual` do caminho perdedor é
       * `Parcela | undefined` e ia direto para `EstornarParcelaResponse.parse`
       * — a vendedora lia "Não consegui falar com o sistema" numa ação que já
       * tinha acontecido.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toBe("PARCELA_NAO_ENCONTRADA");
    } finally {
      cliente.release();
    }
  });

  // ─────────────────── K8 — o PATCH sobre o contrato que caiu ────────────────

  it("K8 · o PATCH perde para o cancelamento em voo: 422, e o PDF não sai com dados novos", async () => {
    const { contrato } = await contratoComCarne(3000);

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("UPDATE contratos SET status = 'CANCELADO', cancelado_em = now() WHERE id = $1", [
        contrato.id,
      ]);

      const respostaP = Promise.resolve(
        agent.patch(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).send({ observacoes: "escrito depois do fim" }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200, e `observacoes` gravado num contrato que a trilha
       * CONTRATO_CANCELADO já congelou — o PDF saindo com o texto novo, e o
       * documento divergindo do que a auditoria diz ter sido cancelado.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("CONTRATO_NAO_ATIVO");
    } finally {
      cliente.release();
    }

    const [depois] = await db.select().from(contratosTable).where(eq(contratosTable.id, contrato.id));
    expect(depois.observacoes).toBeNull();
  });

  // ─────────────────── K9 — a avulsa que colidia no número ───────────────────

  it("K9 · a segunda cobrança de avaria pega o número seguinte em vez de 'Já existe um registro'", async () => {
    const lead = await criarLead(f);
    const criado = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
    });
    expect(criado.status).toBe(201);
    const contratoId = criado.body.id as string;

    const cliente = await pool.connect();
    try {
      // A primeira avulsa em voo: o INSERT toma FOR KEY SHARE na linha do
      // CONTRATO (a FK), que conflita com o FOR UPDATE da rota.
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO parcelas (id, loja_id, contrato_id, numero, descricao, valor_previsto, vencimento)
         VALUES ($1, $2, $3, 1, 'Reparo de avaria — barra', 350, now())`,
        [randomUUID(), f.lojaId, contratoId],
      );

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas`).send({
          descricao: "Reparo de avaria — véu",
          valorPrevisto: 120,
          vencimento: dataFutura(15),
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 409 `REGISTRO_DUPLICADO` — "Já existe um registro com
       * estes dados", no meio de um fluxo de dinheiro, sobre uma cobrança
       * LEGÍTIMA que só precisava do número seguinte. É o caso que
       * `erros.ts:181-185` registra ter sido lido como regressão financeira
       * por dois minutos.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(201);
      expect(resposta.body.numero).toBe(2);
    } finally {
      cliente.release();
    }
  });

  // ─────────────────── P2 — a renumeração que ficava muda ────────────────────

  it("P2 · gerar o carnê depois deixa na trilha o de→para de cada parcela deslocada", async () => {
    const lead = await criarLead(f);
    const criado = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
    });
    expect(criado.status).toBe(201);
    const contratoId = criado.body.id as string;

    const avulsa = await agent.post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas`).send({
      descricao: "Reparo de avaria — barra",
      valorPrevisto: 350,
      vencimento: dataFutura(15),
    });
    expect(avulsa.status).toBe(201);
    expect(avulsa.body.numero).toBe(1);

    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
      .send({ numParcelas: 10, primeiroVencimento: dataFutura(30) });
    expect(plano.status).toBe(201);

    /**
     * VERMELHO ANTES: a avulsa passava de 1 para 11 e NADA explicava por quê. A
     * trilha do recebimento dela dizia "parcela 1", a tela mostrava "parcela
     * 11", e quem conferisse o caixa pela auditoria casava o dinheiro com a
     * linha errada — o oposto exato da razão de a trilha existir.
     */
    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "PARCELAS_RENUMERADAS"), eq(auditLogTable.entidadeId, contratoId)));
    expect(trilha).toBeDefined();
    const dePara = (trilha.detalhe as { deParaPorParcela: { de: number; para: number }[] }).deParaPorParcela;
    expect(dePara).toHaveLength(1);
    expect(dePara[0].de).toBe(1);
    expect(dePara[0].para).toBe(11);

    // E a chave estável passou a existir nas trilhas de parcela: o `parcelaId`
    // é o que a renumeração não move.
    const parcelaAvulsaId = avulsa.body.id as string;
    const remover = await agent.delete(`/api/lojas/${f.lojaId}/parcelas/${parcelaAvulsaId}`);
    expect(remover.status).toBe(204);
    const [trilhaRemocao] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "PARCELA_REMOVIDA"), eq(auditLogTable.entidadeId, parcelaAvulsaId)));
    expect((trilhaRemocao.detalhe as { parcelaId: string }).parcelaId).toBe(parcelaAvulsaId);
  });

  // ─────────────────── P3 — o carimbo que o cancelamento não desfazia ────────

  it("P3 · cancelar tira a noiva da curva de sazonalidade e do kanban de CONTRATO_FECHADO", async () => {
    const { lead, contrato } = await contratoComCarne(4000);

    const [antes] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(antes.contratoFechadoEm).not.toBeNull();
    expect(antes.etapa).toBe("CONTRATO_FECHADO");

    const cancelar = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "Noiva desistiu" });
    expect(cancelar.status).toBe(200);

    /**
     * VERMELHO ANTES: `contratoFechadoEm` continuava preenchido e a etapa
     * continuava CONTRATO_FECHADO. A curva de sazonalidade (`leads.ts:432`)
     * filtra por `contrato_fechado_em is not null`: a venda cancelada seguia
     * contada como fechada, e a curva que diz à dona em que mês vai faltar
     * vestido superestimava a demanda com vendas que não existem.
     */
    const [depois] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
    expect(depois.contratoFechadoEm).toBeNull();
    expect(depois.etapa).toBe("ORCAMENTO_ABERTO");

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.acao, "CONTRATO_CANCELADO"), eq(auditLogTable.entidadeId, contrato.id)));
    const detalhe = trilha.detalhe as Record<string, unknown>;
    expect(detalhe.fechoDesfeito).toBe(true);
    expect(detalhe.etapaDesfeitaPara).toBe("ORCAMENTO_ABERTO");
  });

  /**
   * A outra perna do P3 — "a noiva com OUTRO contrato ativo mantém o carimbo" —
   * NÃO tem teste, e a razão vale mais escrita que omitida.
   *
   * Ela é inalcançável neste banco: o índice `contratos_lead_ativo_unico`
   * recusa o segundo ATIVO do mesmo lead, e a tentativa de montar o estado pelo
   * `db.insert` direto morre com 23505 — foi o que aconteceu na primeira versão
   * deste arquivo. A guarda `!outroAtivo` continua no código porque o índice
   * chega por MIGRAÇÃO (`docs/migracoes/2026-08-11-e158-*.sql`): entre publicar
   * o código e alguém rodar o DDL existe uma janela em que um banco que já viveu
   * pode ter dois ATIVOS legados, e nela a guarda é a única coisa que impede o
   * cancelamento de um deles de apagar o carimbo do outro.
   */

  // ─────────────────── P5 — o 500 que deveria ser 422 ────────────────────────

  it("P5 · `numParcelas: 2.5` é 422 com o campo apontado, e não 500", async () => {
    const lead = await criarLead(f);
    const criado = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 5000,
    });
    expect(criado.status).toBe(201);

    /**
     * VERMELHO ANTES: 500. O spec declara `numParcelas: { type: integer }`
     * (`openapi.yaml:6279`) e o zod gerado perde o `integer` — o fracionário
     * atravessava a porta, batia no `!Number.isInteger` de `plano.ts:84` e
     * subia `PLANO_SEM_PARCELAS` como exceção não tratada. A vendedora lia
     * "Não consegui falar com o sistema" por ter digitado um ponto.
     */
    const resposta = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2.5, primeiroVencimento: dataFutura(30) });
    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toBe("NUM_PARCELAS_INVALIDO");
    expect(resposta.body.campos[0].campo).toBe("numParcelas");
  });
});
