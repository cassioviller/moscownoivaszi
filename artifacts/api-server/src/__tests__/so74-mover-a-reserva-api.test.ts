import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogTable, contratosTable, db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
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
 * S-O74/E189 — **o caminho que a ficha da noiva percorre para matar o V5.**
 *
 * O V5 do CODE-REVIEW: *"a noiva muda o casamento de 12/09 para 03/10, a ficha
 * passa a dizer 03/10, o bloqueio fica em 12/09 para sempre"*. O E173 ensinou
 * o `PATCH /reservas/:id` a propagar a data nova para todos os bloqueios
 * vinculados **e para o contrato ATIVO** (`CONTRATO_DATA_SEGUIU_RESERVA` na
 * trilha), e até o E189 **nenhuma tela o chamava**: `listReservas`,
 * `createReserva`, `updateReserva` e `deleteReserva` tinham zero chamadores em
 * `artifacts/` e `e2e/` (medido — 34 das 200 operações do cliente gerado
 * estavam sem chamador, e estas quatro eram quatro delas).
 *
 * Este arquivo prega o caminho INTEIRO, na ordem em que a ficha o anda, e o
 * teste 1 é a **decisão** do épico escrita como régua: o `PATCH /leads` **não**
 * propaga, de propósito.
 *
 * O motivo é medível: o `PATCH /reservas/:id` revalida a disponibilidade de
 * cada peça e recusa com **409 `VESTIDO_INDISPONIVEL`** quando o vestido não
 * está livre na data nova. Pendurada no `PATCH /leads`, essa recusa faria a
 * correção de um TELEFONE falhar por causa de um vestido ocupado — e a Recepção
 * ganhou `leads.editar` no E172 exatamente para corrigir telefone. A propagação
 * é um GESTO, com destino, confirmação e recusa próprios.
 */
describe("S-O74 — a data da noiva muda, e a reserva só a segue por gesto", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  /** Uma noiva com casamento marcado, uma peça reservada e o contrato ativo. */
  async function noivaComReservaEContrato() {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const dozeDeSetembro = dataFutura(0);
    const lead = await criarLead(f, { casamentoData: dozeDeSetembro });
    const vestido = await criarVestido(f);
    const reserva = await criarReserva(f, {
      leadId: lead.id,
      casamentoData: dozeDeSetembro,
      status: "CONFIRMADA",
    });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dozeDeSetembro,
    });
    const contrato = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        dataCasamento: dozeDeSetembro.toISOString(),
        bloqueioVestidoIds: [bloqueio.id],
      })
      .expect(201);
    return { agent, lead, vestido, reserva, bloqueio, contratoId: contrato.body.id as string };
  }

  it("mover a data na ficha da noiva NÃO move a reserva — é o buraco que a tela passa a mostrar", async () => {
    const { agent, lead, reserva } = await noivaComReservaEContrato();
    const tresDeOutubro = dataFutura(21);

    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ casamentoData: tresDeOutubro.toISOString() })
      .expect(200);

    // A porta que a ficha chama para descobrir a divergência (E185/S-O55).
    const lista = await agent
      .get(`/api/lojas/${f.lojaId}/reservas?leadId=${lead.id}`)
      .expect(200);
    const daNoiva = lista.body.find((r: { id: string }) => r.id === reserva.id);
    expect(daNoiva.casamentoData).toBe(reserva.casamentoData.toISOString());
    expect(daNoiva.casamentoData).not.toBe(tresDeOutubro.toISOString());
  });

  it("a listagem por noiva traz a PEÇA de cada reserva — é o que o aviso escreve", async () => {
    const { agent, lead, vestido } = await noivaComReservaEContrato();
    const lista = await agent
      .get(`/api/lojas/${f.lojaId}/reservas?leadId=${lead.id}`)
      .expect(200);
    // Sem o vestido aninhado o aviso da ficha sai sem dizer QUAL peça está
    // presa na data errada, e a vendedora não sabe o que vai mover.
    const pecas = lista.body.flatMap((r: { bloqueios: { vestido?: { codigo: string } }[] }) =>
      r.bloqueios.map((b) => b.vestido?.codigo),
    );
    expect(pecas).toContain(vestido.codigo);
  });

  it("o gesto move a reserva, as peças e o contrato ATIVO de uma vez, com trilha", async () => {
    const { agent, lead, reserva, bloqueio, contratoId } = await noivaComReservaEContrato();
    const tresDeOutubro = dataFutura(21);

    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ casamentoData: tresDeOutubro.toISOString() })
      .expect(200);

    // O que o botão "Mover para 03/10" faz: uma chamada, o agregado inteiro.
    const movida = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: tresDeOutubro.toISOString() })
      .expect(200);

    expect(movida.body.casamentoData).toBe(tresDeOutubro.toISOString());
    const peca = movida.body.bloqueios.find((b: { id: string }) => b.id === bloqueio.id);
    expect(peca.casamentoData).toBe(tresDeOutubro.toISOString());

    const [contrato] = await db
      .select({ dataCasamento: contratosTable.dataCasamento })
      .from(contratosTable)
      .where(eq(contratosTable.id, contratoId));
    expect(contrato!.dataCasamento!.toISOString()).toBe(tresDeOutubro.toISOString());

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.acao, "CONTRATO_DATA_SEGUIU_RESERVA"),
          eq(auditLogTable.entidadeId, reserva.id),
        ),
      )
      .orderBy(desc(auditLogTable.criadoEm));
    expect(trilha).toBeDefined();
    expect((trilha!.detalhe as { contratos: string[] }).contratos).toContain(contratoId);
  });

  it("a peça ocupada na data nova recusa o gesto — e é por isso que ele não pende do PATCH /leads", async () => {
    const { agent, lead, reserva, vestido } = await noivaComReservaEContrato();
    const tresDeOutubro = dataFutura(21);

    // Outra noiva já segurou a MESMA peça na data nova.
    const outra = await criarLead(f);
    const reservaDaOutra = await criarReserva(f, {
      leadId: outra.id,
      casamentoData: tresDeOutubro,
      status: "CONFIRMADA",
    });
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: outra.id,
      reservaId: reservaDaOutra.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: tresDeOutubro,
    });

    await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ casamentoData: tresDeOutubro.toISOString() })
      .expect(200);

    const recusa = await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: tresDeOutubro.toISOString() })
      .expect(409);
    expect(recusa.body.error).toBe("VESTIDO_INDISPONIVEL");

    // A ficha da noiva seguiu salva — a correção dela não depende do vestido.
    const ficha = await agent.get(`/api/lojas/${f.lojaId}/leads/${lead.id}`).expect(200);
    expect(ficha.body.casamentoData).toBe(tresDeOutubro.toISOString());
  });
});
