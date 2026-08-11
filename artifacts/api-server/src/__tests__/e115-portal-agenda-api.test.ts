import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cabinesTable, db, vestidoFotosTable } from "@workspace/db";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarRegraDisponibilidade,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E115 — a foto do vestido no portal, e a agenda que aceitava o que recusava.
 *
 * **A foto morta.** `GET /portal/foto` autorizava o caminho "vestido do
 * contrato" pela coluna singular LEGADA (`contratos.bloqueio_vestido_id`), que
 * o app nunca preenche — a tela manda `bloqueioVestidoIds` e o servidor grava
 * o N:N. A seção "O seu vestido" aparecia (ela lê o N:N desde o E111) e a foto
 * respondia 404, permanentemente, no celular da noiva. É o irmão exato do
 * defeito que o E111 consertou em `montarVestidoDaNoiva` — a rota da foto
 * ficou para trás.
 *
 * **A porta dos fundos da agenda.** O POST só barrava o DIA fechado; o
 * reagendamento (PATCH) roda as quatro recusas do agenda-core. Uma prova de
 * 90 min às 17h30 ocupa a cabine até as 19h — arrastar um card para as 18h
 * levava 422 CABINE_OCUPADA, e CRIAR um atendimento às 18h na mesma cabine
 * respondia 201. Às 22h também: nascia um atendimento sem célula na grade.
 */
describe("E115 — a foto do contrato aparece, e a agenda recusa igual nos dois caminhos", () => {
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

  it("a foto do vestido preso pelo N:N do contrato responde 200 no portal", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    await db.insert(vestidoFotosTable).values({
      id: randomUUID(),
      vestidoId: vestido.id,
      ordem: 0,
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]),
      mime: "image/jpeg",
      largura: 1,
      altura: 1,
    });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
    });

    // O caminho REAL de criação: a tela manda bloqueioVestidoIds e o servidor
    // grava contrato_bloqueios — a coluna singular legada fica nula.
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 8000,
        bloqueioVestidoIds: [bloqueio.id],
        dataCasamento: dataFutura(90).toISOString(),
      })
      .expect(201);

    const portal = await agent.post(`/api/lojas/${f.lojaId}/leads/${lead.id}/portal`).expect(201);
    const token = portal.body.token as string;

    // VERMELHO ANTES: 404 — o join exigia contratos.bloqueio_vestido_id, nulo
    // em todo contrato criado pelo app.
    await agent.get(`/api/portal/foto?token=${token}&vestidoId=${vestido.id}&ordem=0`).expect(200);
  });

  it("criar atendimento respeita as MESMAS recusas que o reagendar", async () => {
    await criarRegraDisponibilidade(f, {
      atendimentoAberturaHora: 9,
      atendimentoFechamentoHora: 19,
      diasFuncionamento: [0, 1, 2, 3, 4, 5, 6],
      provaDuracao: 3,
    });
    const lead = await criarLead(f);
    const [cabine] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, nome: `Cabine ${randomUUID().slice(0, 6)}` })
      .returning();

    // Um dia útil qualquer, bem à frente, às 17h30 de São Paulo.
    const dia = dataFutura(30);
    const as = (h: number, m: number) => {
      const d = new Date(dia);
      d.setUTCHours(h + 3, m, 0, 0); // hora SP = UTC−3
      return d.toISOString();
    };

    /**
     * E161/G7 — este spec PREGAVA o defeito: criava `tipo: "PROVA"` sem
     * `bloqueioId`, e a suíte verde sobre esse caminho autorizava a prova sem
     * vestido. O comentário de `agenda/index.tsx:154-159` já dizia que o caso
     * tinha sido consertado — foi, na tela; a rota nunca soube, e este teste
     * era a prova de que ninguém ia descobrir. É o caso do E170.
     *
     * A reserva entra agora, e o que o spec afirma (as quatro recusas do
     * reagendar valem no criar) segue valendo intacto.
     */
    const vestidoDaProva = await criarVestido(f);
    const reservaDaProva = await criarBloqueio(f, {
      vestidoId: vestidoDaProva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(150),
      leadId: lead.id,
    });

    function criar(inicio: string, tipo: "ATENDIMENTO" | "PROVA" = "ATENDIMENTO") {
      return agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
        leadId: lead.id,
        cabineId: cabine.id,
        vendedoraId: f.vendedoraId,
        tipo,
        ...(tipo === "PROVA" ? { bloqueioId: reservaDaProva.id } : {}),
        inicio,
      });
    }

    // A prova de 90 min às 17h30 ocupa a cabine até as 19h.
    await criar(as(17, 30), "PROVA").expect(201);

    // VERMELHO ANTES: 201 — o instante exato era diferente e nada mais era
    // conferido; o arrastar para o mesmo lugar levava 422 CABINE_OCUPADA.
    const colisao = await criar(as(18, 0)).expect(422);
    expect(colisao.body.error).toBe("CABINE_OCUPADA");

    // VERMELHO ANTES: 201 — só o dia da semana era conferido, e o atendimento
    // das 22h não tem célula na grade: nascia invisível.
    const madrugada = await criar(as(22, 0)).expect(422);
    expect(madrugada.body.error).toBe("FORA_DO_HORARIO");

    // A porta de casa: horário livre dentro do expediente continua 201.
    await criar(as(14, 0)).expect(201);
  });
});
