import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { atendimentosTable, auditLogTable, cabinesTable, db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarBloqueio,
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
 * S-O97 — **mover a data move a peça e o contrato, e a PROVA fica onde
 * estava.**
 *
 * A propagação do E173 (`reservas.ts:395-494`) alcança `bloqueio_vestidos` e,
 * desde a S-O4, os `contratos` ATIVOS. `atendimentos` só é tocado no ramo
 * CANCELADA, e lá apenas para CONTAR (S-O5). A prova marcada para a janela do
 * casamento ANTIGO continua marcada, e ninguém é avisado.
 *
 * **Vermelho medido em 2026-08-12, antes do conserto:**
 *
 * ```
 * casamento             : D+180
 * prova marcada         : D+171   (dentro da janela D+166–D+176)
 * PATCH casamentoData   : D+161   → 200
 * bloqueio.casamentoData: D+161   ← seguiu
 * atendimento.inicio    : D+171   ← ficou, 10 dias DEPOIS do casamento
 * linhas de trilha sobre a data: 0
 * ```
 *
 * A prova FICA — o `POST /atendimentos` aceita prova em qualquer dia de
 * propósito (G1/E161), e quem move a data da reserva não é quem decide o
 * horário da noiva. O que muda é que agora a loja **sabe**: a tela marca
 * (`lib/prova-fora-da-janela.ts`) e a trilha conta, que é o que responde
 * "quantas provas ficaram para trás" depois do fato.
 *
 * Os números daqui são os mesmos do teste da tela — é o par que prende a janela
 * escrita dos dois lados da borda.
 */
describe("S-O97 — a prova não segue a data, e a loja passa a saber", () => {
  let f: Fixture;
  let cabineId: string;

  beforeAll(async () => {
    f = await criarFixture();
    const [cabine] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, nome: `Cabine ${randomUUID().slice(0, 6)}` })
      .returning();
    cabineId = cabine!.id;
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Casamento em D+`diasCasamento`, prova marcada em D+`diasProva`. */
  async function reservaComProva(diasCasamento: number, diasProva: number) {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = dataFutura(diasCasamento);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamento,
    });
    const prova = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId,
        vendedoraId: f.vendedoraId,
        tipo: "PROVA",
        bloqueioId: bloqueio.id,
        inicio: dataFutura(diasProva).toISOString(),
      })
      .expect(201);
    return { agent, lead, reserva, bloqueio, prova, casamento };
  }

  async function trilhaDaData(reservaId: string) {
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, reservaId), eq(auditLogTable.acao, "RESERVA_DATA_MOVIDA")))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(1);
    return linha?.detalhe as Record<string, unknown> | undefined;
  }

  async function moverPara(agent: Awaited<ReturnType<typeof loginComLoja>>, reservaId: string, dias: number) {
    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reservaId}`)
      .send({ casamentoData: dataFutura(dias).toISOString() })
      .expect(200);
  }

  it("mover o casamento para TRÁS deixa a prova depois dele — e a trilha conta", async () => {
    const { agent, reserva, prova } = await reservaComProva(180, 171);

    await moverPara(agent, reserva.id, 161);

    const detalhe = await trilhaDaData(reserva.id);
    expect(detalhe?.provasForaDaJanela, "a prova ficou 10 dias depois do casamento").toBe(1);
    expect(detalhe?.provasIds, "e o id, para achar a noiva depois").toEqual([prova.body.id]);
  });

  it("mover para a FRENTE também deixa a prova para trás — naquele dia a peça pode ser de outra noiva", async () => {
    const { agent, reserva, prova } = await reservaComProva(200, 191);

    await moverPara(agent, reserva.id, 260);

    const detalhe = await trilhaDaData(reserva.id);
    expect(detalhe?.provasForaDaJanela).toBe(1);
    expect(detalhe?.provasIds).toEqual([prova.body.id]);
  });

  it("prova que continua dentro da janela nova não vira alarme, e a data ainda deixa rastro", async () => {
    // casamento D+300 → D+301: a prova em D+291 segue dentro de [D+287, D+297]
    const { agent, reserva } = await reservaComProva(300, 291);

    await moverPara(agent, reserva.id, 301);

    const detalhe = await trilhaDaData(reserva.id);
    expect(detalhe, "mover a data da reserva sempre deixa linha — não deixava nenhuma").toBeDefined();
    expect(detalhe?.provasForaDaJanela).toBe(0);
    expect(detalhe?.provasIds).toEqual([]);
  });

  it("prova CONCLUÍDA não entra na conta — a noiva já veio", async () => {
    const { agent, reserva, prova } = await reservaComProva(400, 391);
    await db
      .update(atendimentosTable)
      .set({ situacao: "CONCLUIDO" })
      .where(eq(atendimentosTable.id, prova.body.id));

    await moverPara(agent, reserva.id, 381);

    const detalhe = await trilhaDaData(reserva.id);
    expect(detalhe?.provasForaDaJanela).toBe(0);
  });

  it("o par que a tela lê: o bloqueio andou, o atendimento não", async () => {
    const { agent, reserva, bloqueio, prova } = await reservaComProva(500, 491);

    await moverPara(agent, reserva.id, 481);

    const lista = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos`)
      .query({ bloqueioId: bloqueio.id })
      .expect(200);
    const naLista = (lista.body as { id: string; inicio: string; situacao: string; bloqueio?: { casamentoData?: string } }[])
      .find((a) => a.id === prova.body.id);

    const dia = (d: string | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
    expect(naLista?.situacao, "a prova continua de pé").toBe("AGENDADO");
    expect(dia(naLista?.inicio), "e no dia em que foi marcada").toBe(
      dia(dataFutura(491).toISOString()),
    );
    expect(dia(naLista?.bloqueio?.casamentoData), "enquanto a peça já é de outro dia").toBe(
      dia(dataFutura(481).toISOString()),
    );
  });
});
