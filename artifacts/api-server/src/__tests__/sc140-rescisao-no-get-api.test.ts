import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { auditLogTable, contratoItensTable, contratosTable, db, parcelasTable, pool } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  criarContrato,
  criarFixture,
  criarLead,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **S-C140 — a rescisão se lê ANTES do clique.**
 *
 * O E217 pôs a conta no servidor e ela só nascia na RESPOSTA do
 * `POST /cancelar`. O diálogo "Cancelar contrato" seguia com a escolha manual
 * de antes — *"mantém no caixa"* × *"devolvi o valor, estorna tudo"* —, e a
 * segunda devolve **100% do recebido** contra a 8ª §2º, que diz que a reserva
 * não volta sob qualquer hipótese. Medido em `heliumdb`: **428 contratos
 * CANCELADOS** passaram por esse diálogo, contra 311 ATIVOS.
 *
 * O arquivo prega três coisas, e a terceira é a que o plano cobrou:
 *
 * 1. o `GET` devolve a MESMA conta que o `POST /cancelar` devolveria;
 * 2. contrato CANCELADO devolve `null` — registro morto não se recalcula;
 * 3. **o handler continua fazendo 2 queries**. Preencher `rescisao` pede as
 *    duas metades do predicado da 12ª (a marca `vestidos.exclusiva` e a
 *    contagem de saídas ATIVAS), e as duas entram na consulta relacional que
 *    já existia — nenhuma delas é query nova, nem com dois itens no contrato.
 */
describe("S-C140 — `rescisao` no GET do contrato", () => {
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

  async function contratoComPeca(params: {
    valorItem: number;
    exclusiva?: boolean;
    reservaPaga: number;
    restantePago?: number;
    vestidoId?: string;
    cancelado?: boolean;
    itens?: number;
  }) {
    const lead = await criarLead(f);
    const vestido = params.vestidoId
      ? { id: params.vestidoId, nome: "Peça compartilhada" }
      : await criarVestido(f, { exclusiva: params.exclusiva ?? false });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: params.valorItem,
      fechadoEm: new Date(),
      canceladoEm: params.cancelado ? new Date() : null,
    });
    for (let i = 0; i < (params.itens ?? 1); i++) {
      await db.insert(contratoItensTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        descricao: vestido.nome,
        valorUnitario: params.valorItem / (params.itens ?? 1),
        quantidade: 1,
      });
    }
    await db.insert(parcelasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      origem: "PLANO",
      descricao: "Entrada",
      valorPrevisto: params.reservaPaga,
      valorRecebido: params.reservaPaga,
      status: "PAGA",
      recebidoEm: new Date(),
      vencimento: new Date(),
    });
    if (params.restantePago) {
      await db.insert(parcelasTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        descricao: "Parcela 1",
        valorPrevisto: params.restantePago,
        valorRecebido: params.restantePago,
        status: "PAGA",
        recebidoEm: new Date(),
        vencimento: new Date(),
      });
    }
    return { contrato, vestido };
  }

  const ler = (contratoId: string) =>
    agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}`).expect(200);

  it("**8ª §2º/11ª — R$ 1.200 de reserva + R$ 1.000 de carnê: retém R$ 1.800, devolve R$ 400, e a tela lê isso ANTES do clique**", async () => {
    const { contrato } = await contratoComPeca({ valorItem: 3000, reservaPaga: 1200, restantePago: 1000 });
    const r = await ler(contrato.id);
    expect(r.body.rescisao.retencaoTotal).toBe(1800);
    expect(r.body.rescisao.devolucaoTotal).toBe(400);
    // A 8ª §2º primeiro, inteira: a reserva não volta sob qualquer hipótese.
    const reserva = (r.body.rescisao.linhas as { clausula: string; retido: number; devolvido: number }[])
      .find((l) => l.clausula === "8ª §2º");
    expect(reserva).toMatchObject({ retido: 1200, devolvido: 0 });
  });

  it("**12ª — a peça exclusiva no PRIMEIRO aluguel retém o aluguel inteiro, e o próprio contrato não conta como saída anterior**", async () => {
    const { contrato } = await contratoComPeca({
      valorItem: 3000,
      exclusiva: true,
      reservaPaga: 1200,
      restantePago: 1000,
    });
    const r = await ler(contrato.id);
    const linha12a = (r.body.rescisao.linhas as { clausula: string }[]).find((l) => l.clausula === "12ª");
    expect(
      linha12a,
      "sem o `<> contratoId` na contagem, o próprio contrato conta como saída anterior e NENHUMA peça está em primeiro aluguel no momento em que a 12ª precisa dela",
    ).toBeDefined();
    expect(r.body.rescisao.devolucaoTotal).toBe(0);
    expect(r.body.rescisao.retencaoTotal).toBe(2200);
  });

  it("**12ª — a MESMA peça exclusiva numa segunda venda ativa já não está em primeiro aluguel: cai na 11ª**", async () => {
    const vestido = await criarVestido(f, { exclusiva: true });
    await contratoComPeca({ valorItem: 3000, reservaPaga: 0, vestidoId: vestido.id });
    const { contrato: segundo } = await contratoComPeca({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
      vestidoId: vestido.id,
    });
    const r = await ler(segundo.id);
    const clausulas = (r.body.rescisao.linhas as { clausula: string }[]).map((l) => l.clausula);
    expect(clausulas).not.toContain("12ª");
    expect(r.body.rescisao.devolucaoTotal).toBe(400);
  });

  it("**contrato CANCELADO devolve `rescisao: null`** — registro morto não se recalcula", async () => {
    const { contrato } = await contratoComPeca({
      valorItem: 3000,
      reservaPaga: 1200,
      restantePago: 1000,
      cancelado: true,
    });
    const r = await ler(contrato.id);
    expect(r.body.rescisao).toBeNull();
  });

  it("**o aviso do GET é o mesmo desfecho do POST /cancelar** — se divergissem, o diálogo prometeria um número e a porta faria outro", async () => {
    const { contrato } = await contratoComPeca({ valorItem: 3000, reservaPaga: 1200, restantePago: 1000 });
    const antes = await ler(contrato.id);
    const depois = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "A noiva desistiu" })
      .expect(200);
    expect(antes.body.rescisao.retencaoTotal).toBe(depois.body.rescisao.retencaoTotal);
    expect(antes.body.rescisao.devolucaoTotal).toBe(depois.body.rescisao.devolucaoTotal);
    expect(antes.body.rescisao.explicacao).toBe(depois.body.rescisao.explicacao);
  });

  it("**a trilha NOMEIA o estorno que a cláusula não autoriza** — R$ 2.200 devolvidos onde a 8ª §2º/11ª manda reter R$ 1.800", async () => {
    const { contrato } = await contratoComPeca({ valorItem: 3000, reservaPaga: 1200, restantePago: 1000 });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "A dona devolveu tudo por acordo", destinoPago: "estornar" })
      .expect(200);
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, contrato.id), eq(auditLogTable.acao, "CONTRATO_CANCELADO")))
      .orderBy(desc(auditLogTable.criadoEm));
    const detalhe = linha.detalhe as Record<string, unknown>;
    expect(detalhe.totalEstornado).toBe(2200);
    expect(detalhe.rescisaoRetencaoTotal).toBe(1800);
    // `brl()` põe um espaço RÍGIDO (U+00A0) entre o símbolo e o número — E92.
    expect(detalhe.estornoContraARescisao).toContain("1.800,00");
  });

  it("**`manter` segue a régua e a trilha fica calada** — divergência que não existe não se anota", async () => {
    const { contrato } = await contratoComPeca({ valorItem: 3000, reservaPaga: 1200, restantePago: 1000 });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "A noiva perdeu o sinal" })
      .expect(200);
    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, contrato.id), eq(auditLogTable.acao, "CONTRATO_CANCELADO")))
      .orderBy(desc(auditLogTable.criadoEm));
    expect((linha.detalhe as Record<string, unknown>).estornoContraARescisao).toBeNull();
  });

  /**
   * **A régua do custo, no formato do `verificarDisponibilidade` ("exatamente 2
   * queries").** O `GET /contratos/:id` é leitura QUENTE — é a tela que a
   * vendedora abre a cada venda —, e acrescentar a conta da rescisão não podia
   * torná-la mais cara. Medido antes de escrever a primeira linha: **2 queries
   * do handler** (a relacional e a dos vínculos do E72) dentro de **4 do
   * request** (as outras duas são do guard de sessão: a sessão e a loja).
   *
   * O contrato deste teste tem **dois itens** de propósito: a contagem de
   * saídas ATIVAS da 12ª entra como subconsulta correlacionada dentro do mesmo
   * `with`, e um segundo item não pode virar uma segunda ida ao banco.
   */
  it("**o handler continua fazendo 2 queries**, com dois itens no contrato", async () => {
    const { contrato } = await contratoComPeca({
      valorItem: 3000,
      exclusiva: true,
      reservaPaga: 1200,
      restantePago: 1000,
      itens: 2,
    });
    const spy = vi.spyOn(pool, "query");
    await ler(contrato.id);
    const sqls = spy.mock.calls.map((c) =>
      typeof c[0] === "string" ? c[0] : ((c[0] as { text?: string })?.text ?? ""),
    );
    spy.mockRestore();
    const doHandler = sqls.filter((s) => /"contratos"|"contrato_bloqueios"/.test(s));
    expect(
      doHandler.length,
      "a leitura do contrato ficou mais cara — a conta da rescisão tem de caber na consulta relacional que já existia",
    ).toBe(2);
    // E237: +1 — o `GET /contratos/:id` lê o IPCA da loja UMA vez (`ipcaDaLoja`) para a mora das parcelas
    // corrigir pela decisão da P4. É uma consulta pequena por request, e o "handler" acima continua em 2:
    // a conta da rescisão segue na consulta relacional que já existia.
    expect(sqls.length, "o request inteiro: 2 do guard de sessão + 2 do handler + 1 do IPCA (E237)").toBe(5);
    // E as duas metades da 12ª estão DENTRO da relacional, não em query própria:
    // a contagem como subconsulta correlacionada (`ci_outros`) e a marca como
    // `left join lateral` sobre `vestidos`.
    const relacional = sqls.find((s) => /"contratos" "contratosTable"/.test(s)) ?? "";
    expect(relacional).toMatch(/ci_outros/);
    expect(relacional).toMatch(/contratosTable_itens_vestido/);
  });

  it("**a contagem de saídas da peça não vaza para o payload** — ela é insumo da conta, não campo da tela", async () => {
    const { contrato } = await contratoComPeca({ valorItem: 3000, exclusiva: true, reservaPaga: 1200 });
    const r = await ler(contrato.id);
    expect(Object.keys(r.body.itens[0])).not.toContain("locacoesAnteriores");
    expect(Object.keys(r.body.itens[0])).not.toContain("vestido");
  });

  it("**o contrato de outra loja continua 404**, e a rescisão não é uma fresta nova", async () => {
    const outra = await criarFixture();
    try {
      const lead = await criarLead(outra);
      const contrato = await criarContrato(outra, {
        leadId: lead.id,
        valorTotal: 3000,
        fechadoEm: new Date(),
      });
      await agent.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(404);
      await db.delete(contratosTable).where(eq(contratosTable.id, contrato.id));
    } finally {
      await limparFixture(outra);
    }
  });
});
