import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, auditLogTable, bloqueioVestidosTable, contratoBloqueiosTable, contratoItensTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarVestido,
  criarBloqueio,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E223 — a porta de trocar peça do contrato (cláusula 17ª).
 *
 * Antes dela, `contrato_itens` e `contrato_bloqueios` recebiam escrita num
 * sítio só — o INSERT do `POST /contratos` — e trocar de traje era CANCELAR o
 * contrato e fazer outro, o que apagava a trilha financeira junto. A porta:
 * liberta a reserva antiga (soft-cancel), prende a nova com a MESMA régua de
 * disponibilidade do fecho, refaz o snapshot do item (peça e descrição) e
 * deixa rastro.
 *
 * O dinheiro NÃO se mexe: o `valorUnitario` contratado fica. A 17ª não põe
 * preço na troca de MODELO (só na de data, que é o E211); diferença de preço
 * negociada entra pelos gestos financeiros que já existem, e a trilha grava
 * os dois preços para a loja decidir.
 */
describe("E223 — a troca de peça do contrato", () => {
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

  /** A venda inteira: peça reservada, orçamento aprovado com o item, contrato fechado. */
  async function vendaFechada(params?: { valorUnitario?: number }) {
    const valor = params?.valorUnitario ?? 5000;
    const lead = await criarLead(f);
    const vestidoA = await criarVestido(f);
    const casamento = dataFutura(90);
    const bloqueioA = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestidoA.id,
      leadId: lead.id,
      casamentoData: casamento,
    });
    const orcamento = await criarOrcamento(f, { leadId: lead.id });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "VESTIDO",
      descricao: vestidoA.nome,
      valorUnitario: valor,
      vestidoId: vestidoA.id,
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId: orcamento.id,
        valorTotal: valor,
        bloqueioVestidoIds: [bloqueioA.id],
      })
      .expect(201);
    return { lead, vestidoA, bloqueioA, casamento, contratoId: criado.body.id as string };
  }

  it("troca a peça: liberta a antiga, prende a nova, refaz o snapshot e deixa rastro — sem mexer no dinheiro", async () => {
    const { lead, vestidoA, bloqueioA, casamento, contratoId } = await vendaFechada({ valorUnitario: 4200 });
    const vestidoB = await criarVestido(f, { precoBase: 7000 });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(200);
    expect(r.body.vestidoNovoId).toBe(vestidoB.id);
    const bloqueioNovoId = r.body.bloqueioNovoId as string;

    // A reserva antiga foi LIBERTADA (soft-cancel — a EXCLUDE e a
    // disponibilidade deixam de vê-la), e a nova responde pelo contrato.
    const [antiga] = await db.select().from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioA.id));
    expect(antiga!.canceladoEm).not.toBeNull();

    const [nova] = await db.select().from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioNovoId));
    expect(nova!.vestidoId).toBe(vestidoB.id);
    expect(nova!.leadId).toBe(lead.id);
    expect(nova!.tipo).toBe("RESERVA_CASAMENTO");
    expect(nova!.canceladoEm).toBeNull();
    expect(nova!.casamentoData?.toISOString()).toBe(antiga!.casamentoData?.toISOString());
    void casamento;

    // O vínculo vivo trocou de reserva, e o GET conta a história nova.
    const detalhe = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contratoId}`)
      .expect(200);
    expect(detalhe.body.bloqueioVestidoIds).toEqual([bloqueioNovoId]);

    // O snapshot do item aponta a peça nova, com a descrição dela — e o
    // dinheiro contratado FICA: R$ 4.200,00, não os R$ 7.000,00 da peça nova.
    const [item] = await db.select().from(contratoItensTable)
      .where(eq(contratoItensTable.contratoId, contratoId));
    expect(item!.vestidoId).toBe(vestidoB.id);
    expect(item!.descricao).toBe(vestidoB.nome);
    expect(item!.valorUnitario).toBe(4200);
    void vestidoA;

    // A trilha diz o que saiu, o que entrou, e os DOIS preços.
    const [rastro] = await db.select().from(auditLogTable)
      .where(and(
        eq(auditLogTable.entidadeId, contratoId),
        eq(auditLogTable.acao, "CONTRATO_PECA_TROCADA"),
      ));
    expect(rastro).toBeDefined();
    const det = rastro!.detalhe as Record<string, unknown>;
    expect(det.vestidoAntigoId).toBe(vestidoA.id);
    expect(det.vestidoNovoId).toBe(vestidoB.id);
    expect(det.bloqueioAntigoId).toBe(bloqueioA.id);
    expect(det.bloqueioNovoId).toBe(bloqueioNovoId);
    expect(det.valorUnitarioContratado).toBe(4200);
    expect(det.precoBaseDaPecaNova).toBe(7000);
  });

  it("peça nova indisponível no período: 409 com os conflitos, e NADA se move", async () => {
    const { bloqueioA, casamento, contratoId } = await vendaFechada();
    const vestidoB = await criarVestido(f);
    // A peça nova já está reservada para OUTRA noiva no mesmo dia.
    const outraNoiva = await criarLead(f);
    await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestidoB.id,
      leadId: outraNoiva.id,
      casamentoData: casamento,
    });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(409);
    expect(r.body.error).toBe("VESTIDO_INDISPONIVEL");
    expect(r.body.conflitos.length).toBeGreaterThan(0);

    // A transação desfez tudo: a reserva antiga segue viva e presa.
    const [antiga] = await db.select().from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioA.id));
    expect(antiga!.canceladoEm).toBeNull();
    const vinculos = await db.select().from(contratoBloqueiosTable)
      .where(eq(contratoBloqueiosTable.contratoId, contratoId));
    expect(vinculos.map((v) => v.bloqueioId)).toEqual([bloqueioA.id]);
  });

  it("peça já retirada: 422 TROCA_APOS_RETIRADA — troca de modelo acontece antes de a peça sair", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    await db.update(bloqueioVestidosTable)
      .set({ retiradaDataReal: new Date() })
      .where(eq(bloqueioVestidosTable.id, bloqueioA.id));
    const vestidoB = await criarVestido(f);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(422);
    expect(r.body.error).toBe("TROCA_APOS_RETIRADA");
  });

  it("reserva que não é deste contrato: 422, e a frase diz isso", async () => {
    const { contratoId } = await vendaFechada();
    const solta = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: (await criarVestido(f)).id,
      casamentoData: dataFutura(120),
    });
    const vestidoB = await criarVestido(f);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: solta.id, vestidoNovoId: vestidoB.id })
      .expect(422);
    expect(r.body.error).toBe("RESERVA_NAO_E_DESTE_CONTRATO");
  });

  it("contrato cancelado: 422 CONTRATO_NAO_ATIVO — troca é gesto de contrato vivo", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cancelar`)
      .send({ motivo: "teste", manterRecebido: true })
      .expect(200);
    const vestidoB = await criarVestido(f);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(422);
    expect(r.body.error).toBe("CONTRATO_NAO_ATIVO");
  });

  it("trocar para a mesma peça: 422 — não há o que trocar", async () => {
    const { bloqueioA, vestidoA, contratoId } = await vendaFechada();
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoA.id })
      .expect(422);
    expect(r.body.error).toBe("TROCA_PARA_A_MESMA_PECA");
  });

  it("vestido novo inexistente na loja: 404", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: "nao-existe" })
      .expect(404);
    expect(r.body.error).toBe("VESTIDO_NAO_ENCONTRADO");
  });

  /**
   * A reserva antiga pode já estar MORTA (cancelada por outro caminho) com o
   * contrato vivo apontando para ela — e é justamente o estado em que a troca
   * é o único conserto: sem esta porta, o vínculo do contrato ficaria preso a
   * uma reserva que a disponibilidade não vê.
   */
  it("reserva antiga já cancelada: a troca ainda funciona e religa o contrato numa reserva viva", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    await db.update(bloqueioVestidosTable)
      .set({ canceladoEm: new Date() })
      .where(eq(bloqueioVestidosTable.id, bloqueioA.id));
    const vestidoB = await criarVestido(f);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(200);

    const detalhe = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contratoId}`)
      .expect(200);
    expect(detalhe.body.bloqueioVestidoIds).toEqual([r.body.bloqueioNovoId]);
  });
});
