import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogTable,
  bloqueioVestidosTable,
  contratoBloqueiosTable,
  contratoItensTable,
  contratosTable,
  db,
  leadsTable,
  parcelasTable,
  pool,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import { derrubarFilaDeAtrasos } from "../lib/fila-de-atrasos-cache";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarRegraDisponibilidade,
  criarReserva,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E251 — as portas ao lado, segunda passada.**
 *
 * O E245 fechou sete corridas trancando o que se decidia no pool. O
 * `/code-review max` de 16/08 leu o que ele escreveu e achou **cinco corridas
 * que os próprios consertos abriram ou deixaram entreabertas**, mais uma que o
 * E249 abriu ao dar efeito de ocupação ao papel do E224. Este arquivo prega as
 * seis, e cada uma tem **a cena que prova que a rota ESPEROU** — o molde do
 * K1/K7 do E158 e do B1 do E245: uma transação crua segura a linha, a rota é
 * disparada, a transação commita, e o teste diz o que a rota fez com o que ela
 * viu DEPOIS.
 *
 * As seis, e o que cada uma custa em dinheiro ou em papel:
 *
 * - **S-R4 🟠** — o CAS do perdão inclui `status`, e um recebimento PARCIAL
 *   concorrente o faz casar zero linhas: a rota respondia **200 sem gravar
 *   nada**, a tela toastava "Multa e juros perdoados" e a noiva seguia sendo
 *   cobrada.
 * - **S-R8 🟠** — o ciclo ABBA entre `PATCH /reservas` e `PATCH /bloqueios`:
 *   ordens inversas nas mesmas duas tabelas, **40P01**, e uma das duas rotas
 *   caindo com 500.
 * - **S-R10 🟡** — a tranca da cobrança do atraso relia o ESTADO e não o
 *   VALOR: R$ 4.250,00 de oito dias sobre um atraso que já era de sete.
 * - **S-R11 🟡** — a derivação do carimbo lia a trilha no POOL de dentro da
 *   transação, e carimbava "conferida" uma parcela com ato nunca conferido.
 * - **S-R13 🟡** — a qualificação era VALIDADA no lead do pool e CONGELADA no
 *   lead sob a tranca: dois objetos, uma decisão.
 * - **S-RM1 🟡** — a data do papel estica a janela física desde o E249, e as
 *   duas portas que a gravam validavam a disponibilidade pela janela CURTA.
 *
 * A régua da loja desta fixture abre **todos os dias** e **não lava**
 * (`lavagemDiasDepois: 0`), pela razão do E249: as cenas de dinheiro precisam
 * que o fim do uso seja `casamento + usoDiasDepois` exatamente, e as de
 * ocupação precisam que a janela termine ali — senão o número do teste
 * dependeria do dia da semana em que ele roda. O passo do E224 (andar até dia
 * de expediente) é pregado à parte, numa loja com o expediente do papel.
 */
describe("E251 — as portas ao lado, segunda passada", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await criarRegraDisponibilidade(f, { retiradaDias: [0, 1, 2, 3, 4, 5, 6], lavagemDiasDepois: 0 });
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Um dia de negócio N dias atrás de hoje, como instante ancorado. */
  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ───────────────────────────── S-R4 ─────────────────────────────

  /**
   * **S-R4 — o 200 que mente.**
   *
   * O E245 (B3) pôs `status` no CAS do perdão para que perdoar não carimbasse
   * uma parcela que o recebimento quitou no meio. Só que o CAS falha para
   * QUALQUER mudança de status — e o recebimento PARCIAL é uma delas. O
   * fallback só devolvia 422 quando `moraDe` era `null`; com saldo ainda em
   * aberto ele caía no `res.json(200)` com `moraPerdoadaEm: null`.
   */
  describe("S-R4 — perdoar a mora decide SOB a tranca da parcela", () => {
    async function parcelaVencida() {
      const lead = await criarLead(f);
      const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 500, fechadoEm: new Date() });
      const [parcela] = await db.insert(parcelasTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        valorPrevisto: 500,
        vencimento: diasAtras(30),
        status: "PREVISTA",
      }).returning();
      return { contrato, parcela: parcela! };
    }

    const perdoar = (parcelaId: string) =>
      agent
        .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/perdoar-mora`)
        .send({ motivo: "A noiva perdeu o pai na semana do vencimento." });

    const parcelaDe = async (id: string) =>
      (await db.select().from(parcelasTable).where(eq(parcelasTable.id, id)))[0]!;

    const trilhaDoPerdao = (parcelaId: string) =>
      db.select().from(auditLogTable).where(and(
        eq(auditLogTable.acao, "MORA_PERDOADA"),
        eq(auditLogTable.entidadeId, parcelaId),
      ));

    it("recebimento PARCIAL em voo: o perdão ESPERA e é GRAVADO — não devolve 200 de mentira", async () => {
      const { parcela } = await parcelaVencida();
      const cliente = await pool.connect();
      try {
        // R$ 100,00 entram na parcela de R$ 500,00: o status vira PARCIAL e o
        // saldo de R$ 400,00 continua vencido — há mora, e ela é perdoável.
        await cliente.query("BEGIN");
        await cliente.query(
          `UPDATE parcelas SET status = 'PARCIAL', valor_recebido = 100, recebido_em = now() WHERE id = $1`,
          [parcela.id],
        );
        const respostaP = Promise.resolve(perdoar(parcela.id));
        await espera(300);
        await cliente.query("COMMIT");
        const r = await respostaP;
        // ANTES: 200, `moraPerdoadaEm: null`, zero linhas de trilha — a tela
        // toastava "Multa e juros perdoados" sobre uma parcela intacta.
        expect(r.status).toBe(200);
        expect(r.body.moraPerdoadaEm).not.toBeNull();
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      const depois = await parcelaDe(parcela.id);
      expect(depois.moraPerdoadaEm, "o perdão respondeu 200 e não gravou nada").not.toBeNull();
      expect(depois.moraPerdoadaMotivo).toContain("perdeu o pai");
      expect(await trilhaDoPerdao(parcela.id), "200 sem linha MORA_PERDOADA é um perdão que não existe").toHaveLength(1);
    });

    it("e o recebimento que QUITA em voo continua respondendo 422 — o estado final não é o pedido (E245/B3)", async () => {
      const { parcela } = await parcelaVencida();
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query(
          `UPDATE parcelas SET status = 'PAGA', valor_recebido = 500, recebido_em = now() WHERE id = $1`,
          [parcela.id],
        );
        const respostaP = Promise.resolve(perdoar(parcela.id));
        await espera(300);
        await cliente.query("COMMIT");
        const r = await respostaP;
        expect(r.status).toBe(422);
        expect(r.body.error).toBe("SEM_MORA");
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      expect((await parcelaDe(parcela.id)).moraPerdoadaEm).toBeNull();
      expect(await trilhaDoPerdao(parcela.id)).toHaveLength(0);
    });

    it("o duplo clique segue idempotente: o segundo devolve a parcela perdoada, com UMA linha de trilha", async () => {
      const { parcela } = await parcelaVencida();
      await perdoar(parcela.id).expect(200);
      const r = await perdoar(parcela.id).expect(200);
      expect(r.body.moraPerdoadaEm).not.toBeNull();
      expect(await trilhaDoPerdao(parcela.id)).toHaveLength(1);
    });
  });

  // ───────────────────────────── S-R8 ─────────────────────────────

  /**
   * **S-R8 — o ciclo ABBA, e por que ele não se conserta num lado só.**
   *
   * A ordem do módulo está escrita desde o E159, no topo de `reservas.ts`:
   * *linha-pai → contrato → parcelas → bloqueios → vestidos*. O `PATCH
   * /bloqueios` do E245 (B5) tomava `contratos` e depois `vestidos`; o `PATCH
   * /reservas` tomava `vestidos` e depois escrevia em `contratos`. Duas rotas,
   * as mesmas duas tabelas, ordens inversas.
   *
   * **A cena é a segunda perna do ciclo, feita à mão.** Uma transação crua
   * segura a tabela que a rota deveria tomar PRIMEIRO e, depois de a rota estar
   * disparada, pede a que ela deveria tomar DEPOIS. Se a rota respeitar a
   * ordem, ela ainda não encostou na segunda e a transação crua a recebe na
   * hora; se não respeitar, ela já a segura e o Postgres fecha o ciclo com
   * **40P01 `deadlock detected`** — matando uma das duas.
   */
  describe("S-R8 — as duas portas tomam contrato → bloqueio → vestido, na ordem", () => {
    async function noivaComPeca(casamento: Date) {
      const lead = await criarLead(f);
      const vestido = await criarVestido(f);
      const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
      const contrato = await criarContrato(f, {
        leadId: lead.id,
        valorTotal: 5000,
        dataCasamento: casamento,
        fechadoEm: new Date(),
      });
      const bloqueio = await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: casamento,
      });
      await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
      return { lead, vestido, reserva, contrato, bloqueio };
    }

    const daquiADias = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), n));

    it("PATCH /reservas espera em CONTRATOS antes de encostar no vestido — sem 40P01", async () => {
      const { vestido, reserva, contrato } = await noivaComPeca(daquiADias(120));
      const cliente = await pool.connect();
      let pegouOVestido = false;
      try {
        // A primeira perna: quem cancela/desfaz retirada segura o CONTRATO.
        await cliente.query("BEGIN");
        await cliente.query(`SELECT id FROM contratos WHERE id = $1 FOR UPDATE`, [contrato.id]);

        const respostaP = Promise.resolve(
          agent
            .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
            .send({ casamentoData: daquiADias(150).toISOString() }),
        );
        await espera(400);

        // A segunda perna: quem segura o contrato agora quer o VESTIDO.
        // ANTES: a rota já o segurava (ela o trancava primeiro) e esperava no
        // `UPDATE contratos` — ciclo fechado, `deadlock detected`, 500.
        await cliente.query(`SELECT id FROM vestidos WHERE id = $1 FOR UPDATE`, [vestido.id]);
        pegouOVestido = true;
        await cliente.query("COMMIT");

        const r = await respostaP;
        expect(r.status).toBe(200);
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      expect(pegouOVestido, "a rota segurava o vestido enquanto esperava o contrato — é o ciclo ABBA").toBe(true);
    });

    it("PATCH /bloqueios espera no BLOQUEIO antes de encostar no vestido — a metade de lá do mesmo ciclo", async () => {
      const { vestido, bloqueio } = await noivaComPeca(daquiADias(200));
      const cliente = await pool.connect();
      let pegouOVestido = false;
      try {
        // O `POST /contratos` e o `PATCH /reservas` tomam bloqueios (7) antes de
        // vestidos (8). Esta é a mesma primeira perna, feita à mão.
        await cliente.query("BEGIN");
        await cliente.query(`SELECT id FROM bloqueio_vestidos WHERE id = $1 FOR UPDATE`, [bloqueio.id]);

        const respostaP = Promise.resolve(
          agent
            .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
            .send({ provaDataReal: daquiADias(190).toISOString() }),
        );
        await espera(400);

        // ANTES: a rota trancava o VESTIDO primeiro e só depois escrevia no
        // bloqueio — pedir o vestido daqui fechava o ciclo.
        await cliente.query(`SELECT id FROM vestidos WHERE id = $1 FOR UPDATE`, [vestido.id]);
        pegouOVestido = true;
        await cliente.query("COMMIT");

        expect((await respostaP).status).toBe(200);
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      expect(pegouOVestido, "a rota segurava o vestido antes do bloqueio — a outra metade do ciclo").toBe(true);
    });
  });

  // ───────────────────────────── S-R10 ─────────────────────────────

  /**
   * **S-R10 — a tranca relia o estado e não o VALOR.**
   *
   * Esta é a única cobrança do sistema cujo valor depende do dia em que alguém
   * clicou, e os fatos de que ela depende mudam por outras portas. O E245 (B1)
   * trancou o contrato e releu `status` e `atraso_parcela_id`; a conta
   * continuava vindo de um `pecasAtrasadasDoContrato` lido no POOL, antes da
   * transação — e a janela entre aquela leitura e a tranca é exatamente o tempo
   * que a rota passa ESPERANDO por quem já segura o contrato.
   */
  describe("S-R10 — a conta do atraso é feita DEPOIS da tranca, com o tx", () => {
    async function pecaAtrasada(aluguel: number, casamentoHaDias: number) {
      const lead = await criarLead(f);
      const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: aluguel, fechadoEm: new Date() });
      const vestido = await criarVestido(f);
      const casamento = diasAtras(casamentoHaDias);
      const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
      const bloqueio = await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: casamento,
        retiradaDataReal: diasAtras(casamentoHaDias + 3),
      });
      await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
      await db.insert(contratoItensTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        descricao: vestido.nome,
        valorUnitario: aluguel,
        quantidade: 1,
      });
      return { contrato, bloqueio };
    }

    it("a devolução COMMITA enquanto a cobrança espera a tranca: a parcela nasce de 7 dias, não de 8", async () => {
      // Casamento há 10, janela até há 8, peça ainda fora → 8 dias × R$ 500,00
      // + R$ 250,00 do §1º = R$ 4.250,00. É o que a rota lia no pool.
      const { contrato, bloqueio } = await pecaAtrasada(3000, 10);
      derrubarFilaDeAtrasos(f.lojaId);

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query(`SELECT id FROM contratos WHERE id = $1 FOR UPDATE`, [contrato.id]);

        const respostaP = Promise.resolve(
          agent.post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`).send({}),
        );
        await espera(300);

        // A loja registra a devolução de ONTEM enquanto a dona espera para
        // cobrar. Sete dias, não oito.
        await db.update(bloqueioVestidosTable)
          .set({ devolucaoDataReal: diasAtras(1) })
          .where(eq(bloqueioVestidosTable.id, bloqueio.id));

        await cliente.query("COMMIT");
        const r = await respostaP;
        expect(r.status).toBe(201);
        // ANTES: 4250 — R$ 500,00 de uma diária que a noiva não deve.
        expect(r.body.valor).toBe(7 * 500 + 250);
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }

      const [parcela] = await db.select().from(parcelasTable)
        .where(and(eq(parcelasTable.contratoId, contrato.id), eq(parcelasTable.origem, "ATRASO_DEVOLUCAO")));
      expect(Number(parcela!.valorPrevisto), "a parcela gravada é a conta de antes da tranca").toBe(3750);
      expect(parcela!.descricao).toContain("7 dia");
    });

    it("e a devolução que zera o atraso na janela devolve 422 SEM_ATRASO — sem parcela nenhuma", async () => {
      const { contrato, bloqueio } = await pecaAtrasada(3000, 10);
      derrubarFilaDeAtrasos(f.lojaId);
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query(`SELECT id FROM contratos WHERE id = $1 FOR UPDATE`, [contrato.id]);
        const respostaP = Promise.resolve(
          agent.post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`).send({}),
        );
        await espera(300);
        // Devolvida no último dia do prazo: não há atraso nenhum.
        await db.update(bloqueioVestidosTable)
          .set({ devolucaoDataReal: diasAtras(8) })
          .where(eq(bloqueioVestidosTable.id, bloqueio.id));
        await cliente.query("COMMIT");
        const r = await respostaP;
        // ANTES: 201 e uma parcela de R$ 4.250,00 sobre quem devolveu em dia.
        expect(r.status).toBe(422);
        expect(r.body.error).toBe("SEM_ATRASO");
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      expect(await db.select().from(parcelasTable)
        .where(and(eq(parcelasTable.contratoId, contrato.id), eq(parcelasTable.origem, "ATRASO_DEVOLUCAO")))).toHaveLength(0);
    });
  });

  // ───────────────────────────── S-R11 ─────────────────────────────

  /**
   * **S-R11 — o carimbo derivado sobre um ato que ninguém conferiu.**
   *
   * O E245 (B4) fechou o lado do ESTORNO: a escrita repete `recebido_em IS NOT
   * NULL`. O outro lado ficava aberto — um recebimento NOVO que commita entre a
   * leitura da trilha e a escrita cria um ato `PARCELA_RECEBIDA` que a trilha
   * lida não tem, e a parcela ganha o carimbo "conferida com o extrato" com um
   * pedaço que nunca bateu com extrato nenhum. Ele atravessa a guarda do B4
   * porque receber deixa `recebido_em` preenchido.
   */
  describe("S-R11 — a derivação do carimbo decide sob a tranca das parcelas", () => {
    it("um recebimento NOVO commita na janela: a parcela NÃO é carimbada, e a rota não tocou parcelas enquanto esperava", async () => {
      const lead = await criarLead(f);
      const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 1000, fechadoEm: new Date() });
      const [parcela] = await db.insert(parcelasTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        valorPrevisto: 1000,
        vencimento: ancoraDeNegocio(hojeLocal()),
        status: "PREVISTA",
      }).returning();

      // O primeiro pedaço, pela PORTA: R$ 500,00 e a linha PARCELA_RECEBIDA.
      await agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcela!.id}/receber`)
        .send({ valorRecebido: 500, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
        .expect(200);
      const [ato1] = await db.select().from(auditLogTable).where(and(
        eq(auditLogTable.acao, "PARCELA_RECEBIDA"),
        eq(auditLogTable.entidadeId, parcela!.id),
      ));

      const cliente = await pool.connect();
      try {
        // O SEGUNDO pedaço, em voo: a recepção lança R$ 500,00 no mesmo segundo.
        // (A porta faz as duas escritas na mesma transação; aqui elas são
        // cruas para que a janela seja controlada pelo teste.)
        await cliente.query("BEGIN");
        await cliente.query(
          `UPDATE parcelas SET status = 'PAGA', valor_recebido = 1000, recebido_em = now(), conciliado_em = NULL WHERE id = $1`,
          [parcela!.id],
        );
        await cliente.query(
          `INSERT INTO audit_log (id, loja_id, usuario_id, usuario_nome, acao, entidade, entidade_id, detalhe)
           VALUES ($1, $2, $3, 'Recepção', 'PARCELA_RECEBIDA', 'parcela', $4, $5::jsonb)`,
          [randomUUID(), f.lojaId, f.vendedoraId, parcela!.id,
            JSON.stringify({ contratoId: contrato.id, valorRecebido: 500, aoPrincipal: 500, aMora: 0, totalRecebido: 1000 })],
        );

        // A conciliação é da DONA (o módulo `financeiro`), não da vendedora.
        const dona = await loginComLoja(f.superAdminEmail, f.lojaId);
        const respostaP = Promise.resolve(
          dona.post(`/api/lojas/${f.lojaId}/financeiro/conciliacao/marcar`).send({ reciboIds: [ato1!.id] }),
        );
        await espera(400);

        /**
         * O molde do `pg_locks` do E245/B1: um `UPDATE` não commitado é
         * invisível daqui, então a prova de que a rota ainda não escreveu em
         * `parcelas` é o LOCK de tabela — que o Postgres toma ANTES de esperar
         * pela linha. ANTES: a rota já tinha derivado o carimbo e estava
         * bloqueada dentro do `UPDATE parcelas`, com o `RowExclusiveLock` na
         * mão. Depois: ela espera num `SELECT … FOR UPDATE`, que é
         * `RowShareLock`.
         */
        const { rows } = await cliente.query(
          `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
           WHERE c.relname = 'parcelas' AND l.mode = 'RowExclusiveLock' AND l.pid <> pg_backend_pid()`,
        );
        expect(rows[0].n, "a conciliação derivou o carimbo ANTES de trancar a parcela").toBe(0);

        await cliente.query("COMMIT");
        const r = await respostaP;
        expect(r.status).toBe(200);
        expect(r.body.recibos).toBe(1);
        // ANTES: 1 — a parcela entrava em `derivadas` com o ato novo por conferir.
        expect(r.body.parcelas).toBe(0);
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }

      const [depois] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcela!.id));
      expect(depois!.conciliadoEm, "parcela carimbada com um ato que ninguém conferiu").toBeNull();
    });
  });

  // ───────────────────────────── S-R13 ─────────────────────────────

  /**
   * **S-R13 — validação e snapshot voltam a ser o mesmo objeto.**
   *
   * O E245 (B8) mandou a qualificação congelar do lead sob a tranca, e com
   * razão. A guarda `QUALIFICACAO_INCOMPLETA` e o bookkeeping de etapa/perda
   * ficaram lendo o lead do POOL: a porta conferia uma ficha e congelava outra.
   */
  describe("S-R13 — a ficha que a porta confere é a ficha que ela congela", () => {
    async function fecharContrato(leadId: string) {
      return agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
        leadId,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
      });
    }

    it("a recepção APAGA o CPF em voo: o contrato não nasce com qualificação incompleta", async () => {
      const lead = await criarLead(f);
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query(`UPDATE leads SET cpf = NULL WHERE id = $1`, [lead.id]);
        const respostaP = Promise.resolve(fecharContrato(lead.id));
        await espera(300);
        await cliente.query("COMMIT");
        const r = await respostaP;
        // ANTES: 201, e o contrato congelava `cpf: null` — a linha de
        // qualificação do instrumento saía em branco nos dois lugares em que
        // ela aparece, sem que a régua do E215 dissesse uma palavra.
        expect(r.status).toBe(422);
        expect(r.body.error).toBe("QUALIFICACAO_INCOMPLETA");
        expect(r.body.campos.map((c: { campo: string }) => c.campo)).toContain("cpf");
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      expect(await db.select().from(contratosTable).where(eq(contratosTable.leadId, lead.id))).toHaveLength(0);
    });

    it("a noiva é marcada PERDIDA em voo: o contrato a REVIVE — não commita CONTRATO_FECHADO com perdida_em de pé", async () => {
      const lead = await criarLead(f);
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query(
          `UPDATE leads SET etapa = 'PERDIDO', perdida_em = now(), perdida_motivo = 'PRECO' WHERE id = $1`,
          [lead.id],
        );
        const respostaP = Promise.resolve(fecharContrato(lead.id));
        await espera(300);
        await cliente.query("COMMIT");
        expect((await respostaP).status).toBe(201);
      } finally {
        await cliente.query("ROLLBACK").catch(() => {});
        cliente.release();
      }
      const [depois] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));
      expect(depois!.etapa).toBe("CONTRATO_FECHADO");
      // ANTES: `perdida_em` continuava preenchido — a conversão contava a venda
      // como perda e a noiva entrava na janela do expurgo LGPD com contrato
      // ATIVO (S-M24, achado 6#5, reaberto pela janela).
      expect(depois!.perdidaEm, "vender para quem voltou É reviver — a S-M24 pela porta de trás").toBeNull();
      expect(depois!.perdidaMotivo).toBeNull();
    });
  });

  // ───────────────────────────── S-RM1 ─────────────────────────────

  /**
   * **S-RM1 — o papel estica a janela física, e o 409 não via os dias que ele
   * estica.**
   *
   * Desde o E249/S-R3 o fim do uso é `fimPrevistoDaDevolucao`, e o papel do
   * E224 anda para a frente até dia de expediente da 4ª: ele é **≥ `casamento
   * + usoDiasDepois`**. As duas portas que gravam a data do papel validavam a
   * disponibilidade pela janela CURTA — nos dias entre uma e outra a peça
   * ficava ocupada por uma escrita que o 409 nunca viu.
   *
   * Esta loja tem o expediente do PAPEL (terça a sábado, o default do schema),
   * porque é o passo do E224 que produz a diferença. Datas literais: casamento
   * **sábado 11/09/2027**, janela até **segunda 13/09** (que a 4ª fecha), papel
   * na **terça 14/09**.
   */
  describe("S-RM1 — o dia que o papel promete não se oferece a outra noiva", () => {
    let g: Fixture;
    let agentG: Awaited<ReturnType<typeof loginComLoja>>;

    beforeAll(async () => {
      g = await criarFixture();
      agentG = await loginComLoja(g.vendedoraEmail, g.lojaId);
      // Expediente do papel (terça a sábado, o default) e sem lavagem — o que
      // se mede aqui são os dois dias entre a janela e o papel, e não a cauda
      // dos sete dias de lavanderia.
      await criarRegraDisponibilidade(g, { lavagemDiasDepois: 0 });
    });

    afterAll(async () => {
      await limparFixture(g);
    });

    const SABADO = new Date("2027-09-11T12:00:00-03:00");
    const TERCA = "2027-09-14";

    /** A peça, com a terça do papel já ocupada por uma manutenção. */
    async function pecaComATercaOcupada() {
      const vestido = await criarVestido(g);
      await criarBloqueio(g, {
        tipo: "MANUTENCAO",
        vestidoId: vestido.id,
        inicio: new Date(`${TERCA}T12:00:00-03:00`),
        fim: new Date(`${TERCA}T12:00:00-03:00`),
      });
      return vestido;
    }

    it("POST /contratos: a devolução do papel cai num dia ocupado — 409, e não um contrato que promete o que a peça não tem", async () => {
      const vestido = await pecaComATercaOcupada();
      const lead = await criarLead(g);
      const reserva = await criarReserva(g, { leadId: lead.id, casamentoData: SABADO });
      const bloqueio = await criarBloqueio(g, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: SABADO,
      });

      const r = await agentG.post(`/api/lojas/${g.lojaId}/contratos`).send({
        leadId: lead.id,
        vendedoraId: g.vendedoraId,
        valorTotal: 5000,
        dataCasamento: SABADO.toISOString(),
        dataRetirada: "2027-09-08T10:30:00-03:00",
        // A sugestão do E224: a janela termina na segunda, que a 4ª fecha.
        dataDevolucao: `${TERCA}T18:00:00-03:00`,
        bloqueioVestidoIds: [bloqueio.id],
      });

      // ANTES: 201 — o candidato era medido pela janela (até segunda 13/09) e a
      // terça 14/09 ficava prometida a duas peças ao mesmo tempo.
      expect(r.status).toBe(409);
      expect(r.body.error).toBe("VESTIDO_INDISPONIVEL");
      expect(await db.select().from(contratosTable).where(eq(contratosTable.leadId, lead.id))).toHaveLength(0);
    });

    it("e sem data de devolução no corpo continua valendo a janela — o 201 de sempre", async () => {
      const vestido = await pecaComATercaOcupada();
      const lead = await criarLead(g);
      const reserva = await criarReserva(g, { leadId: lead.id, casamentoData: SABADO });
      const bloqueio = await criarBloqueio(g, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: SABADO,
      });
      await agentG.post(`/api/lojas/${g.lojaId}/contratos`).send({
        leadId: lead.id,
        vendedoraId: g.vendedoraId,
        valorTotal: 5000,
        dataCasamento: SABADO.toISOString(),
        bloqueioVestidoIds: [bloqueio.id],
      }).expect(201);
    });

    it("PATCH /reservas: adiar para o sábado cujo papel cai na terça ocupada — 409, e nada se move", async () => {
      const vestido = await pecaComATercaOcupada();
      const lead = await criarLead(g);
      const casamentoVelho = new Date("2027-06-12T12:00:00-03:00");
      const reserva = await criarReserva(g, { leadId: lead.id, casamentoData: casamentoVelho });
      const bloqueio = await criarBloqueio(g, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: casamentoVelho,
      });
      const contrato = await criarContrato(g, {
        leadId: lead.id,
        valorTotal: 5000,
        dataCasamento: casamentoVelho,
        dataRetirada: new Date("2027-06-09T10:30:00-03:00"),
        dataDevolucao: new Date("2027-06-15T18:00:00-03:00"),
        fechadoEm: new Date(),
      });
      await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });

      const r = await agentG
        .patch(`/api/lojas/${g.lojaId}/reservas/${reserva.id}`)
        .send({ casamentoData: SABADO.toISOString() });

      // ANTES: 200 — a rota media o candidato pela janela nova (até segunda
      // 13/09) e gravava, dez linhas abaixo, um papel que ia até a terça.
      expect(r.status).toBe(409);
      expect(r.body.error).toBe("VESTIDO_INDISPONIVEL");

      const [b] = await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueio.id));
      expect(new Date(b!.casamentoData!).toISOString().slice(0, 10)).toBe("2027-06-12");
      const [c] = await db.select().from(contratosTable).where(eq(contratosTable.id, contrato.id));
      expect(new Date(c!.dataDevolucao!).toISOString().slice(0, 10)).toBe("2027-06-15");
    });
  });
});
