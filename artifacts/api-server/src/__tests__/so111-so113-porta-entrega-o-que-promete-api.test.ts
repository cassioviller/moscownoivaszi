import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cabinesTable, db } from "@workspace/db";
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
 * S-O113 · S-O111 · metade da S-O112 — **a porta entrega o que o schema
 * promete.**
 *
 * As três saíram da mesma varredura, a `varredura-schemas-aninhados` do E192, e
 * são a mesma frase em três portas: a resposta é a linha CRUA do `.returning()`
 * ou de um `with` mais estreito que o schema, e o campo declarado chega
 * `undefined`. Quem consome a resposta em vez de refazer um `GET` desenha a
 * tela com o buraco.
 *
 * **Vermelho medido em 2026-08-12:**
 *
 * ```
 * PATCH /contratos/:id  → itens undefined · parcelas undefined · lead undefined · vendedora undefined
 * POST  /ajustes        → proximaProva undefined · pecaDoAcervo undefined
 * PATCH /ajustes/:id    → proximaProva undefined · pecaDoAcervo undefined
 * POST  /parcelas/:id/receber  → contrato undefined
 * POST  /parcelas/:id/estornar → contrato undefined
 * ```
 *
 * A outra metade da S-O112 continua aberta **por ser decisão de spec**: onde a
 * parcela viaja DENTRO do contrato, prometer o contrato de volta dentro dela é
 * repetir o pai N vezes no filho, e o conserto é estreitar o schema (o idioma
 * que o E192 usou em `Atendimento.ajustes`), não engordar a resposta.
 */
describe("S-O113/S-O111/S-O112 — a porta entrega o que o schema promete", () => {
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

  async function contratoDeVerdade(dias: number) {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const data = dataFutura(dias);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: data });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: data,
    });
    const contrato = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        dataCasamento: data.toISOString(),
        bloqueioVestidoIds: [bloqueio.id],
        itens: [{ tipo: "VESTIDO", vestidoId: vestido.id, descricao: "Vestido", valorUnitario: 5000, quantidade: 1 }],
      })
      .expect(201);
    return { agent, lead, vestido, bloqueio, contrato };
  }

  /**
   * A régua é a porta IRMÃ, e não um número escrito à mão: o que o `GET` entrega
   * é o que o `PATCH` tem de entregar. O carnê é gerado antes de propósito —
   * com `parcelas: []` dos dois lados o teste passaria por igualdade vazia, que
   * é a classe de asserção que a regra 34 manda não escrever.
   *
   * (`itens` só nasce de orçamento aceito — o `POST /contratos` **não aceita**
   * `itens` no corpo, e mandá-los é o mesmo silêncio do zod que quase deu um
   * verde falso no E173. Aqui os dois lados são `[]`, e quem prova a entrega é
   * o `parcelas` cheio ao lado.)
   */
  it("S-O113 · o PATCH do contrato devolve as MESMAS quatro relações que o GET", async () => {
    const { agent, contrato } = await contratoDeVerdade(180);
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.body.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 3, primeiroVencimento: dataFutura(30).toISOString() })
      .expect(201);

    const patch = await agent
      .patch(`/api/lojas/${f.lojaId}/contratos/${contrato.body.id}`)
      .send({ observacoes: "combinado por telefone" })
      .expect(200);
    const get = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.body.id}`)
      .expect(200);

    expect(patch.body.parcelas, "o carnê de 3 parcelas, como a irmã o entrega").toHaveLength(3);
    expect(patch.body.parcelas.map((p: { numero: number }) => p.numero).sort()).toEqual(
      get.body.parcelas.map((p: { numero: number }) => p.numero).sort(),
    );
    expect(patch.body.itens, "itens: array, não undefined").toEqual(get.body.itens);
    expect(patch.body.lead?.id, "a noiva").toBe(get.body.lead.id);
    expect(patch.body.vendedora?.id, "quem vendeu").toBe(get.body.vendedora.id);
    expect(patch.body.observacoes, "sem perder o que o UPDATE gravou").toBe("combinado por telefone");
  });

  it("S-O111 · o POST e o PATCH de ajuste devolvem prazo e peça, como a fila devolve", async () => {
    const { agent, lead, bloqueio } = await contratoDeVerdade(200);
    const prova = await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId,
        vendedoraId: f.vendedoraId,
        tipo: "PROVA",
        bloqueioId: bloqueio.id,
        inicio: dataFutura(190).toISOString(),
      })
      .expect(201);
    // a prova SEGUINTE do mesmo bloqueio é o prazo real da costureira (E14)
    await agent
      .post(`/api/lojas/${f.lojaId}/atendimentos`)
      .send({
        leadId: lead.id,
        cabineId,
        vendedoraId: f.vendedoraId,
        tipo: "PROVA",
        bloqueioId: bloqueio.id,
        inicio: dataFutura(195).toISOString(),
      })
      .expect(201);

    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/ajustes`)
      .send({ atendimentoId: prova.body.id, tipo: "AJUSTE", descricao: "Bainha" })
      .expect(201);

    const dia = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
    expect(dia(criado.body.proximaProva), "o prazo nasce com o trabalho").toBe(
      dia(dataFutura(195).toISOString()),
    );
    expect(criado.body.pecaDoAcervo, "confecção nenhuma virou peça ainda — null, não undefined").toBeNull();

    const editado = await agent
      .patch(`/api/lojas/${f.lojaId}/ajustes/${criado.body.id}`)
      .send({ descricao: "Bainha e alça" })
      .expect(200);
    expect(dia(editado.body.proximaProva)).toBe(dia(dataFutura(195).toISOString()));
    expect(editado.body.pecaDoAcervo).toBeNull();

    // a fila continua respondendo o mesmo — é dela que a régua saiu
    const fila = await agent.get(`/api/lojas/${f.lojaId}/ajustes`).expect(200);
    const naFila = (fila.body as { id: string; proximaProva: string | null }[]).find((a) => a.id === criado.body.id);
    expect(dia(naFila?.proximaProva)).toBe(dia(criado.body.proximaProva));
  });

  it("S-O112 · receber e estornar devolvem a parcela COM o contrato e a noiva", async () => {
    const { agent, contrato, lead } = await contratoDeVerdade(220);
    const plano = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.body.id}/parcelas/gerar-plano`)
      .send({ numParcelas: 2, primeiroVencimento: dataFutura(10).toISOString() })
      .expect(201);
    const parcelaId = (plano.body as { id: string }[])[0]!.id;

    const recebida = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`)
      .send({ valorRecebido: 100, recebidoEm: new Date().toISOString(), formaRecebimento: "PIX" })
      .expect(200);
    expect(recebida.body.contrato?.leadId, "de quem era o dinheiro").toBe(lead.id);
    expect(recebida.body.contrato?.lead?.noivaNome, "e o nome que a tela mostra").toBe(lead.noivaNome);

    const estornada = await agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/estornar`)
      .send({})
      .expect(200);
    expect(estornada.body.contrato?.lead?.noivaNome).toBe(lead.noivaNome);
  });
});
