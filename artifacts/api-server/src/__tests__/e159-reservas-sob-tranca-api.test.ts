import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  db,
  pool,
  reservasTable,
  bloqueioVestidosTable,
  avariasTable,
  parcelasTable,
  contratosTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E159 — em `reservas.ts`, as quatro portas sem tranca e o estado terminal em
 * todas.
 *
 * O irmão do E158, um nível abaixo: o mesmo padrão (guarda lida no pool,
 * escrita sem reconferência) em quatro portas que a S-M22/S-M24 não enumerou,
 * mais três guardas que simplesmente não existiam. O desfecho medido é sempre
 * o mesmo — **a peça prometida a duas noivas, ou dinheiro que não entra**.
 *
 * As corridas seguem o molde determinístico do
 * `sm7-corrida-reserva-exclusiva-api.test.ts:64-91`. A ordem das trancas do
 * módulo está em `reservas.ts:65`, e desde o E180 ela é CONFERIDA — os degraus
 * em `portas-de-escrita.ts`, a régua em `varredura-portas-sob-tranca.test.ts`.
 */
describe("E159 — as guardas de reservas.ts relidas sob a tranca", () => {
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

  /** Uma reserva CONFIRMADA com um vestido pendurado nela. */
  async function reservaComVestido(diasAteOCasamento = 120) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamentoData = dataFutura(diasAteOCasamento);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData, status: "CONFIRMADA" });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData,
      leadId: lead.id,
      reservaId: reserva.id,
    });
    return { lead, vestido, reserva, bloqueio, casamentoData };
  }

  // ─────────── R4/V10 — a única rota de escrita que não trancava nada ────────

  it("R4/V10 · CANCELADA é terminal também sob corrida: a segunda transição leva 422", async () => {
    const { reserva } = await reservaComVestido();

    const cliente = await pool.connect();
    try {
      // O cancelamento em voo. A rota lê CONFIRMADA no pool, passa pela guarda
      // rápida, e só então descobre — sob a tranca — que perdeu.
      await cliente.query("BEGIN");
      await cliente.query("UPDATE reservas SET status = 'CANCELADA' WHERE id = $1", [reserva.id]);

      const respostaP = Promise.resolve(
        agent.patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`).send({ status: "CONCLUIDA" }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200. As duas requisições liam CONFIRMADA, as duas
       * passavam pela máquina de estados, e a segunda gravava por cima —
       * **a reserva ficava CONCLUIDA com todos os vestidos soltos e uma trilha
       * dizendo que ela foi cancelada.**
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("TRANSICAO_INVALIDA");
      expect(resposta.body.detalhe).toContain("CANCELADA");
    } finally {
      cliente.release();
    }

    const [depois] = await db.select().from(reservasTable).where(eq(reservasTable.id, reserva.id));
    expect(depois.status).toBe("CANCELADA");
  });

  // ─────────── R1 — cancelar solta a peça de um contrato que nasce agora ─────

  it("R1 · o contrato em voo segura a reserva: 409, e o vestido NÃO volta ao mercado", async () => {
    const { reserva, bloqueio, lead } = await reservaComVestido();
    const contratoId = randomUUID();

    const cliente = await pool.connect();
    try {
      // O contrato de R$ 5.000,00 nascendo: o INSERT do vínculo toma
      // FOR KEY SHARE na linha do bloqueio, que conflita com o FOR UPDATE novo.
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO contratos (id, loja_id, lead_id, vendedora_id, valor_total)
         VALUES ($1, $2, $3, $4, 5000)`,
        [contratoId, f.lojaId, lead.id, f.vendedoraId],
      );
      await cliente.query(
        "INSERT INTO contrato_bloqueios (contrato_id, bloqueio_id) VALUES ($1, $2)",
        [contratoId, bloqueio.id],
      );

      const respostaP = Promise.resolve(
        agent.patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`).send({ status: "CANCELADA" }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200. A contagem de contratos ATIVOS que a S-M24 pôs
       * rodava sem tranca — o contrato commitava no meio e o cancelamento,
       * que já tinha lido zero, gravava `canceladoEm` por cima. Contrato ATIVO
       * de R$ 5.000,00 cobrando as 9 parcelas com o vestido SOLTO de volta ao
       * mercado: o bloqueio soft-cancelado sai da disponibilidade e do EXCLUDE,
       * outra noiva reserva a mesma peça para a mesma data, e a dupla promessa
       * só aparece na retirada.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("RESERVA_COM_CONTRATO");
    } finally {
      cliente.release();
    }

    const [depois] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(depois.canceladoEm).toBeNull();
  });

  // ─────────── R3 — a propagação de data que revalidava sem tranca ───────────

  it("R3 · a propagação enxerga o bloqueio nascido na janela: 409 em vez de gravar por cima", async () => {
    const { reserva, vestido } = await reservaComVestido(200);
    const novaData = dataFutura(120);

    const cliente = await pool.connect();
    try {
      /**
       * O bloqueio concorrente na MESMA peça: casamento longe (envelope físico
       * sem sobreposição, então o EXCLUDE do banco não fica sabendo) mas com
       * PROVA marcada exatamente no dia para onde a reserva está indo. É o par
       * PROVA×FÍSICA que só `conflitos()` enxerga — o caso que o R3 descreve.
       */
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO bloqueio_vestidos
           (id, loja_id, vestido_id, tipo, casamento_data, prova_data_real, ocupacao_inicio, ocupacao_fim)
         VALUES ($1, $2, $3, 'RESERVA_CASAMENTO', $4, $5, $6, $7)`,
        [
          randomUUID(),
          f.lojaId,
          vestido.id,
          dataFutura(300),
          novaData,
          dataFutura(297).toISOString().slice(0, 10),
          dataFutura(309).toISOString().slice(0, 10),
        ],
      );

      const respostaP = Promise.resolve(
        agent.patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`).send({ casamentoData: novaData }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 200. O POST e o PATCH de bloqueio trancam a linha do
       * VESTIDO porque a verificação precisa enxergar os criadores
       * concorrentes; esta porta refazia a mesma verificação sem a mesma
       * tranca, lia antes do commit e gravava a data nova por cima do
       * conflito. O EXCLUDE não salva: ele só compara envelopes FÍSICOS.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("VESTIDO_INDISPONIVEL");
    } finally {
      cliente.release();
    }
  });

  // ─────────── R2/V8 — o DELETE que recontava com a lista velha ──────────────

  it("R2/V8 · o bloqueio nascido na janela é recontado: 409, e nada cai pela cascata em silêncio", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    // Reserva SEM bloqueio nenhum — é o caso que expunha o defeito inteiro:
    // com a lista vazia, o `if (bloqueioIds.length)` pulava a recontagem.
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataFutura(150) });
    const bloqueioNovoId = randomUUID();

    const cliente = await pool.connect();
    try {
      // O INSERT com `reserva_id` toma FOR KEY SHARE na linha da reserva, que
      // conflita com o FOR UPDATE do DELETE.
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO bloqueio_vestidos (id, loja_id, vestido_id, reserva_id, tipo, casamento_data)
         VALUES ($1, $2, $3, $4, 'RESERVA_CASAMENTO', $5)`,
        [bloqueioNovoId, f.lojaId, vestido.id, reserva.id, dataFutura(150)],
      );
      await cliente.query(
        `INSERT INTO avarias (id, loja_id, bloqueio_id, descricao) VALUES ($1, $2, $3, 'Barra rasgada')`,
        [randomUUID(), f.lojaId, bloqueioNovoId],
      );

      const respostaP = Promise.resolve(agent.delete(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`));
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 204. A API respondia 201 para quem criou o bloqueio e
       * 204 para quem apagou a reserva, a avaria com a foto-prova caía pelo
       * `ON DELETE CASCADE`, e a auditoria gravava `bloqueios: 0`.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("RESERVA_COM_HISTORICO");
    } finally {
      cliente.release();
    }

    const [aindaLa] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioNovoId));
    expect(aindaLa).toBeDefined();
  });

  // ─────────── V13 — a coluna legada que o DELETE irmão conta de propósito ───

  it("V13 · contrato ATIVO pendurado na coluna legada segura o DELETE da reserva", async () => {
    const { reserva, bloqueio, lead } = await reservaComVestido();
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: new Date(),
    });
    // O vínculo SINGULAR legado, sem passar pelo N:N — é lido em produção
    // (portal, PDF) e o `DELETE /bloqueios` o conta desde sempre.
    await db
      .update(contratosTable)
      .set({ bloqueioVestidoId: bloqueio.id })
      .where(eq(contratosTable.id, contrato.id));

    /**
     * VERMELHO ANTES: 204. O contrato ficava com o vínculo nulo pelo `set null`
     * da FK e **as parcelas seguiam sendo cobradas sobre um vestido que voltou
     * ao mercado**.
     */
    const resposta = await agent.delete(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`);
    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toBe("RESERVA_COM_HISTORICO");
    expect(resposta.body.contratosAtivos).toBe(1);
  });

  // ─────────── R7 — estado terminal é terminal também nesta porta ────────────

  it("R7 · não se pendura vestido em reserva CANCELADA: 422 com o caminho", async () => {
    const { reserva } = await reservaComVestido();
    const outroVestido = await criarVestido(f);
    await db
      .update(reservasTable)
      .set({ status: "CANCELADA" })
      .where(eq(reservasTable.id, reserva.id));

    /**
     * VERMELHO ANTES: 201. O bloqueio nascia **invisível para a
     * disponibilidade e visível para o EXCLUDE**: a tela mostrava o vestido
     * livre, e o INSERT da próxima noiva morria em 23P01 com um 409 que não
     * diz qual reserva está no caminho — sem saída a não ser apagar na mão.
     */
    const resposta = await agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
      vestidoId: outroVestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      reservaId: reserva.id,
    });
    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toBe("RESERVA_CANCELADA");
  });

  // ─────────── V12 — o null que virava 01/01/1970 ────────────────────────────

  it("V12 · `casamentoData: null` é 422 nas duas portas, e não uma reserva em 1970", async () => {
    const lead = await criarLead(f);

    /**
     * VERMELHO ANTES: 201/200 com a data em **1970-01-01**. `zod.coerce.date()`
     * chama `new Date(null)`, que é uma data válida, e `.optional()` só
     * curto-circuita em `undefined` — medido:
     * `UpdateReservaBody.safeParse({ casamentoData: null })` devolve
     * `success: true` com `1970-01-01T00:00:00.000Z`. O casamento sumia da
     * lente "Reservas" e reaparecia sob "janeiro de 1970", com o vestido
     * LIVRE no calendário para a data real.
     */
    const criacao = await agent
      .post(`/api/lojas/${f.lojaId}/reservas`)
      .send({ leadId: lead.id, casamentoData: null });
    expect(criacao.status).toBe(422);
    expect(criacao.body.error).toBe("DATA_DE_CASAMENTO_INVALIDA");

    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: dataFutura(100) });
    const alteracao = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: null });
    expect(alteracao.status).toBe(422);
    expect(alteracao.body.error).toBe("DATA_DE_CASAMENTO_INVALIDA");

    const [depois] = await db.select().from(reservasTable).where(eq(reservasTable.id, reserva.id));
    expect(depois.casamentoData!.getFullYear()).toBeGreaterThan(2020);
  });

  // ─────────── R9 — cobrar num contrato que caiu na janela ───────────────────

  it("R9 · o cancelamento em voo barra a cobrança: 422, e a parcela NÃO nasce fora do contrato", async () => {
    const { bloqueio, lead } = await reservaComVestido();
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 5000, fechadoEm: new Date() });
    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Mancha na cauda", custoReparo: 480 });
    expect(avaria.status).toBe(201);

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("UPDATE contratos SET status = 'CANCELADO', cancelado_em = now() WHERE id = $1", [
        contrato.id,
      ]);

      const respostaP = Promise.resolve(
        agent
          .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
          .send({ contratoId: contrato.id }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 201. A parcela de R$ 480,00 nascia FORA do contrato —
       * contrato CANCELADO com parcela viva no carnê, no aging e no extrato do
       * portal da noiva.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("CONTRATO_NAO_ATIVO");
    } finally {
      cliente.release();
    }

    const parcelas = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contrato.id));
    expect(parcelas).toHaveLength(0);
  });

  // ─────────── V11 — as duas cobranças que colidiam na UNIQUE ────────────────

  it("V11 · a segunda avaria pega o número seguinte em vez de 'Já existe um registro'", async () => {
    const { bloqueio, lead } = await reservaComVestido();
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 5000, fechadoEm: new Date() });
    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Renda solta", custoReparo: 500 });
    expect(avaria.status).toBe(201);

    const cliente = await pool.connect();
    try {
      // A primeira cobrança em voo, ocupando o número 1. O INSERT toma
      // FOR KEY SHARE na linha do contrato, que conflita com o FOR UPDATE novo.
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO parcelas (id, loja_id, contrato_id, numero, origem, descricao, valor_previsto, vencimento)
         VALUES ($1, $2, $3, 1, 'AVARIA', 'Reparo de avaria — barra', 350, now())`,
        [randomUUID(), f.lojaId, contrato.id],
      );

      const respostaP = Promise.resolve(
        agent
          .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
          .send({ contratoId: contrato.id }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 409 `REGISTRO_DUPLICADO` — "Já existe um registro com
       * estes dados", que se lê como *já cobrei este reparo*. A vendedora para
       * de tentar e **os R$ 500,00 da segunda avaria nunca entram**.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(201);
    } finally {
      cliente.release();
    }

    const parcelas = await db
      .select()
      .from(parcelasTable)
      .where(eq(parcelasTable.contratoId, contrato.id));
    expect(parcelas.map((p) => p.numero).sort()).toEqual([1, 2]);
  });

  // ─────────── V15 — o único DELETE do arquivo sem FOR UPDATE ────────────────

  it("V15 · a avaria não some enquanto a cobrança dela nasce: 409, e a parcela não fica órfã", async () => {
    const { bloqueio, lead } = await reservaComVestido();
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 5000, fechadoEm: new Date() });
    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Cauda rasgada", custoReparo: 1500 });
    expect(avaria.status).toBe(201);
    const parcelaId = randomUUID();

    const cliente = await pool.connect();
    try {
      // A cobrança em voo: a parcela nasce e a avaria é marcada. O UPDATE toma
      // a linha da avaria, que é a mesma que o DELETE passou a trancar.
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO parcelas (id, loja_id, contrato_id, numero, origem, descricao, valor_previsto, vencimento)
         VALUES ($1, $2, $3, 1, 'AVARIA', 'Reparo de avaria — cauda', 1500, now())`,
        [parcelaId, f.lojaId, contrato.id],
      );
      await cliente.query("UPDATE avarias SET parcela_id = $1 WHERE id = $2", [parcelaId, avaria.body.id]);

      const respostaP = Promise.resolve(agent.delete(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}`));
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 204. Sobrava **parcela viva de R$ 1.500,00 sem foto,
       * sem descrição e sem avaria que a sustente** — o cenário literal que o
       * cabeçalho do E97/F23 diz existir para impedir. A FK é `set null`, então
       * nem o banco reclama.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("AVARIA_COM_COBRANCA");
    } finally {
      cliente.release();
    }

    const [aindaLa] = await db.select().from(avariasTable).where(eq(avariasTable.id, avaria.body.id));
    expect(aindaLa).toBeDefined();
    expect(aindaLa.fotoBytes === null || aindaLa.descricao === "Cauda rasgada").toBe(true);
    const [parcela] = await db
      .select()
      .from(parcelasTable)
      .where(and(eq(parcelasTable.id, parcelaId), eq(parcelasTable.lojaId, f.lojaId)));
    expect(parcela).toBeDefined();
  });
});
