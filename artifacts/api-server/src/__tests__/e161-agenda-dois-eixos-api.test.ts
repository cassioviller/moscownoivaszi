import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, atendimentosTable, ausenciasTable, bloqueioVestidosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
 * E161 — a agenda: o eixo da vendedora, e o PATCH que pulava a recusa.
 *
 * O fecho da Faixa A. A fatia 4 da revisão achou a régua de agendamento
 * re-derivada em três lugares com as três divergindo; este arquivo prova o
 * lado do SERVIDOR: a janela que lia uma duração e comparava com outra (G4),
 * a troca de vendedora que não consultava recusa nenhuma (G3), a tranca que
 * cobria um eixo só (G5), a prova sem vestido que a tela já recusava e a rota
 * não (G7), o vestido de outra noiva (G2) e o carimbo de conclusão que movia
 * ocupação sem revalidar nada (G1).
 *
 * A loja da fixture NÃO tem regra de propósito: o `EXPEDIENTE_PADRAO`
 * (9h–20h, todos os dias, prova de 2 slots) é exatamente onde o G4 vivia.
 */
describe("E161 — a agenda nos dois eixos", () => {
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

  let seqCabine = 0;
  async function criarCabine() {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/cabines`)
      .send({ nome: `Cabine E161 ${seqCabine++} ${randomUUID().slice(0, 6)}` });
    expect(r.status).toBe(201);
    return r.body as { id: string };
  }

  /** Instante em São Paulo: dataFutura(dias) com a hora local trocada. */
  function emSP(dias: number, hora: number, minuto = 0): Date {
    const d = dataFutura(dias);
    d.setUTCHours(hora + 3, minuto, 0, 0); // hora SP = UTC−3
    return d;
  }

  /** Uma reserva de vestido para pendurar a prova. */
  async function reservaDaNoiva(leadId: string | null, diasAteOCasamento = 200) {
    const vestido = await criarVestido(f);
    return await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(diasAteOCasamento),
      leadId,
    });
  }

  // ─────────── G7 — prova é prova de um vestido ──────────────────────────────

  it("G7/A06.3 · PROVA sem bloqueioId é 422 — a rota passa a saber o que a tela já sabia", async () => {
    const lead = await criarLead(f);
    const cabine = await criarCabine();

    /**
     * VERMELHO ANTES: 201. O comentário de `agenda/index.tsx:154-159` dizia
     * que isso foi consertado ao matar o diálogo antigo — foi, NA TELA; a rota
     * nunca soube. A noiva vinha ao ateliê, a cabine ficava ocupada, e no dia
     * não havia peça reservada para ela experimentar. O spec
     * `e115-portal-agenda:119` pregava o defeito e mudou junto.
     */
    const r = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      inicio: emSP(30, 10).toISOString(),
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("PROVA_SEM_VESTIDO");
  });

  // ─────────── G2 — o vestido tem de ser da noiva ────────────────────────────

  it("G2/A05.3 · o bloqueio de OUTRA noiva é 422; o sem dona passa", async () => {
    const ana = await criarLead(f);
    const beatriz = await criarLead(f);
    const cabine = await criarCabine();
    const reservaDaBeatriz = await reservaDaNoiva(beatriz.id);

    /**
     * VERMELHO ANTES: 201 — prova na ficha da Ana com o vestido da Beatriz. Ao
     * concluir, o carimbo do E37 caía NO BLOQUEIO DA BEATRIZ: a janela dela
     * colapsava para um dia em que ela não provou nada, e a peça era liberada
     * antes da hora.
     */
    const errada = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: ana.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: reservaDaBeatriz.id,
      inicio: emSP(31, 10).toISOString(),
    });
    expect(errada.status).toBe(422);
    expect(errada.body.error).toBe("RESERVA_DE_OUTRA_NOIVA");

    // A reserva SEM dona passa — é o caso comum (61 de 63 no dev), e este
    // contrato de comportamento não pode regredir para uma parede diária.
    const semDona = await reservaDaNoiva(null);
    const ok = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: ana.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: semDona.id,
      inicio: emSP(31, 14).toISOString(),
    });
    expect(ok.status).toBe(201);
  });

  // ─────────── G3 — trocar a vendedora É movimento ───────────────────────────

  it("G3 · trocar SÓ a vendedora consulta a ausência: a colega de férias não recebe atendimento", async () => {
    const lead = await criarLead(f);
    const cabine = await criarCabine();
    const inicio = emSP(32, 11);

    const criado = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      inicio: inicio.toISOString(),
    });
    expect(criado.status).toBe(201);

    // A colega está de férias no dia do atendimento.
    await db.insert(ausenciasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      usuarioId: f.superAdminId,
      inicio: inicio.toISOString().slice(0, 10),
      fim: inicio.toISOString().slice(0, 10),
      motivo: "Férias",
    });

    /**
     * VERMELHO ANTES: 200. `mudouMovimento` olhava `inicio` e `cabineId` e
     * nada mais — trocar o responsável pulava o `recusaDeMover` inteiro, e a
     * vendedora de férias recebia o atendimento que a grade, consultando a
     * MESMA função, nunca teria aceitado.
     */
    const troca = await agent
      .patch(`/api/lojas/${f.lojaId}/atendimentos/${criado.body.id}`)
      .send({ vendedoraId: f.superAdminId });
    expect(troca.status).toBe(422);
    expect(troca.body.error).toBe("VENDEDORA_AUSENTE");

    const [depois] = await db.select().from(atendimentosTable)
      .where(eq(atendimentosTable.id, criado.body.id));
    expect(depois.vendedoraId).toBe(f.vendedoraId);
  });

  // ─────────── G4 — a janela e a régua leem a mesma duração ──────────────────

  it("G4 · a prova das 13:15 entra na janela de busca: o atendimento das 14:00 leva 422", async () => {
    const lead = await criarLead(f);
    const lead2 = await criarLead(f);
    const cabine = await criarCabine();
    const reserva = await reservaDaNoiva(lead.id);

    // A prova de 60 min (EXPEDIENTE_PADRAO, provaDuracao 2) às 13:15 ocupa a
    // cabine até as 14:15. O horário quebrado é o caso real da recepção que
    // encaixa a noiva "assim que a outra sair".
    const prova = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: reserva.id,
      inicio: emSP(33, 13, 15).toISOString(),
    });
    expect(prova.status).toBe(201);

    /**
     * VERMELHO ANTES: 201. A janela de concorrentes era
     * `regra?.provaDuracao ?? 1` — ±30 min — enquanto a régua da sobreposição
     * lia o expediente efetivo, com `provaDuracao: 2`. A loja SEM regra (a
     * recém-criada!) buscava [13:30, 14:30] e a prova das 13:15 ficava FORA do
     * SELECT: duas noivas na mesma cabine às 14:00, sem UNIQUE que pegasse —
     * a UNIQUE é do instante exato, e o conflito é de intervalo desde o E40.
     */
    const colisao = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead2.id,
      cabineId: cabine.id,
      vendedoraId: f.superAdminId,
      inicio: emSP(33, 14).toISOString(),
    });
    expect(colisao.status).toBe(422);
    expect(colisao.body.error).toBe("CABINE_OCUPADA");
  });

  // ─────────── G5 — a tranca cobre o eixo da vendedora ───────────────────────

  it("G5/A06.2 · a mesma vendedora em duas cabines no mesmo horário: quem chega segundo leva 422", async () => {
    const lead = await criarLead(f);
    const leadDaOutra = await criarLead(f);
    const cabineA = await criarCabine();
    const cabineB = await criarCabine();
    const inicioProva = emSP(34, 14);

    const cliente = await pool.connect();
    try {
      // A prova em voo na cabine A, ocupando a vendedora das 14:00 às 15:00.
      // O INSERT toma FOR KEY SHARE na linha da VENDEDORA (a FK), que conflita
      // com o FOR UPDATE novo de `trancarEixos` — antes, a rota só trancava a
      // cabine (B, livre) e nada a segurava.
      await cliente.query("BEGIN");
      await cliente.query(
        `INSERT INTO atendimentos (id, loja_id, lead_id, cabine_id, vendedora_id, tipo, inicio)
         VALUES ($1, $2, $3, $4, $5, 'PROVA', $6)`,
        [randomUUID(), f.lojaId, leadDaOutra.id, cabineA.id, f.vendedoraId, inicioProva.toISOString()],
      );

      const respostaP = Promise.resolve(
        agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
          leadId: lead.id,
          cabineId: cabineB.id,
          vendedoraId: f.vendedoraId,
          inicio: emSP(34, 14, 30).toISOString(),
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      /**
       * VERMELHO ANTES: 201 — as duas requisições trancavam CABINES
       * diferentes, não se enxergavam, e a vendedora ficava marcada em duas
       * cabines ao mesmo tempo. A S-M22 fechou o eixo da cabine e deixou o da
       * vendedora vivo; a UNIQUE `(loja, vendedora, inicio)` só pega o
       * instante EXATO, e aqui os inícios diferem por 30 min dentro da prova.
       */
      const resposta = await respostaP;
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toBe("VENDEDORA_OCUPADA");
    } finally {
      cliente.release();
    }
  });

  // ─────────── G1 — concluir a prova revalida quando o carimbo move ──────────

  it("G1 · concluir a prova num dia ocupado por OUTRA noiva é 409 — e o rollback desfaz a conclusão", async () => {
    const noivaA = await criarLead(f);
    const noivaB = await criarLead(f);
    const cabine = await criarCabine();
    const vestido = await criarVestido(f);

    // O vestido da noiva B, com o uso físico em torno de +100 dias.
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(100),
      leadId: noivaB.id,
    });
    // A reserva da noiva A na MESMA peça, casamento longe (+200): as janelas
    // não se tocam na criação.
    const reservaDaA = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(200),
      leadId: noivaA.id,
    });

    // A prova da A marcada — por engano ou remarcação — exatamente no meio do
    // uso físico da B. O POST aceita: a agenda não olha o vestido.
    const prova = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: noivaA.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: reservaDaA.id,
      inicio: emSP(100, 10).toISOString(),
    });
    expect(prova.status).toBe(201);

    /**
     * VERMELHO ANTES: 200, com `provaDataReal` gravado. O comentário do E37
     * dizia "colapsar a janela só reduz ocupação — nunca cria conflito", o que
     * só é verdade quando a data real cai DENTRO da janela derivada. Fora
     * dela, o carimbo MOVE a ocupação: a prova da A concluída no dia do uso da
     * B é o estado exato que o `PATCH /reservas` recusa com 409 — e entrava
     * por um UPDATE sem nem a tranca do vestido.
     */
    const concluir = await agent
      .patch(`/api/lojas/${f.lojaId}/atendimentos/${prova.body.id}`)
      .send({ situacao: "CONCLUIDO" });
    expect(concluir.status).toBe(409);
    expect(concluir.body.error).toBe("VESTIDO_INDISPONIVEL");

    // O rollback desfez as DUAS metades: nem conclusão órfã, nem carimbo.
    const [atendimento] = await db.select().from(atendimentosTable)
      .where(eq(atendimentosTable.id, prova.body.id));
    expect(atendimento.situacao).toBe("AGENDADO");
    const [bloqueio] = await db.select().from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, reservaDaA.id));
    expect(bloqueio.provaDataReal).toBeNull();
  });

  it("G1 · e o caminho normal segue de pé: a prova concluída no dia dela carimba e responde 200", async () => {
    const noiva = await criarLead(f);
    const cabine = await criarCabine();
    const reserva = await reservaDaNoiva(noiva.id, 150);

    // A prova dentro da janela derivada dela (casamento −14 dias).
    const prova = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: noiva.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: reserva.id,
      inicio: emSP(140, 10).toISOString(),
    });
    expect(prova.status).toBe(201);

    const concluir = await agent
      .patch(`/api/lojas/${f.lojaId}/atendimentos/${prova.body.id}`)
      .send({ situacao: "CONCLUIDO" });
    expect(concluir.status).toBe(200);

    const [bloqueio] = await db.select().from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, reserva.id));
    expect(bloqueio.provaDataReal).not.toBeNull();
  });
});
