import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogTable, contratosTable, db, parcelasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import {
  criarContrato,
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E213 — a parcela vencida tem multa e juros** (contrato de locação,
 * cláusula 9ª).
 *
 * > **9ª** — Em caso de inadimplemento quanto ao pagamento do aluguel, deverá
 * > incidir multa pecuniária de **2%**, juros de mora de **1% ao mês** e
 * > correção monetária.
 *
 * O sistema já sabia que a parcela estava atrasada desde o E49 e **não cobrava
 * nada por isso**. A conta pura e as leituras declaradas estão em
 * `financeiro-core/mora.ts` e na régua dela
 * (`moscow-noivas/src/lib/financeiro/mora.test.ts`). Este arquivo prega o outro
 * lado: **o que as PORTAS respondem** — e a mais importante delas é a de
 * receber, que antes recusava o dinheiro certo.
 *
 * Base: a PARCELA vencida (decisão da dona, 13/08/2026, CDC art. 52 §1º).
 * Carnê de referência: R$ 500,00 por parcela.
 */
describe("E213 — a parcela vencida tem multa e juros", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    // A fila de cobrança pede o módulo `financeiro`, que a vendedora da fixture
    // não tem — o mesmo login das suítes irmãs (`recebimento-parcial`,
    // `e103-conciliacao`).
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));
  const daquiADias = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), n));

  /** Uma noiva com contrato ATIVO e uma parcela com o vencimento pedido. */
  async function parcelaCom(params: { vencimento: Date; valor?: number; recebido?: number }) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: new Date(),
    });
    const [parcela] = await db
      .insert(parcelasTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero: 1,
        origem: "PLANO",
        descricao: "Parcela 1",
        valorPrevisto: params.valor ?? 500,
        vencimento: params.vencimento,
        status: params.recebido ? "PARCIAL" : "PREVISTA",
        valorRecebido: params.recebido ?? null,
      })
      .returning();
    return { lead, contrato, parcela: parcela! };
  }

  const fila = () =>
    agent.get(`/api/lojas/${f.lojaId}/financeiro/parcelas`).query({ status: "abertas" });

  const naFila = async (parcelaId: string) => {
    const r = await fila().expect(200);
    return (r.body as { id: string }[]).find((p) => p.id === parcelaId) as Record<string, unknown>;
  };

  const receber = (parcelaId: string, valor: number) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`).send({
      valorRecebido: valor,
      recebidoEm: new Date().toISOString(),
      formaRecebimento: "PIX",
    });

  const perdoar = (parcelaId: string, motivo: string) =>
    agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/perdoar-mora`).send({ motivo });

  const restabelecer = (parcelaId: string) =>
    agent.delete(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/perdoar-mora`);

  const parcelaDe = async (id: string) =>
    (await db.select().from(parcelasTable).where(eq(parcelasTable.id, id)))[0]!;

  it("a parcela a vencer não tem mora, e `null` não é erro", async () => {
    const { parcela } = await parcelaCom({ vencimento: daquiADias(10) });
    expect((await naFila(parcela.id))!.mora).toBeNull();
  });

  it("vencer HOJE ainda é estar em dia — é o último dia de pagar", async () => {
    const { parcela } = await parcelaCom({ vencimento: ancoraDeNegocio(hojeLocal()) });
    expect((await naFila(parcela.id))!.mora).toBeNull();
  });

  it("R$ 500,00 vencidos há 30 dias aparecem na fila valendo R$ 515,00", async () => {
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    const mora = (await naFila(parcela.id))!.mora as Record<string, unknown>;
    expect(mora.dias).toBe(30);
    expect(mora.multa).toBe(10);
    expect(mora.juros).toBe(5);
    expect(mora.total).toBe(515);
    expect(mora.perdoada).toBe(false);
    expect(mora.explicacao).toContain("Sem correção monetária");
  });

  it("a mora incide sobre o SALDO — a PARCIAL já paga não é multada de novo", async () => {
    // R$ 500,00 com R$ 300,00 recebidos: a conta é sobre os R$ 200,00.
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30), recebido: 300 });
    const mora = (await naFila(parcela.id))!.mora as Record<string, unknown>;
    expect(mora.saldo).toBe(200);
    expect(mora.multa).toBe(4);
    expect(mora.total).toBe(206);
  });

  /**
   * **O achado mais caro do épico, e ele estava na porta que ninguém mexeu.**
   *
   * A guarda do `receber` comparava com `valorPrevisto − jaRecebido`, e isso era
   * a dívida inteira enquanto multa e juros não existiam. Ligada a 9ª, a fila, o
   * carnê e o portal passam a dizer R$ 515,00 — e a porta recusava esse mesmo
   * valor com `VALOR_ACIMA_DO_SALDO`, dizendo à vendedora que ela estava
   * cobrando demais o número que o próprio sistema imprimiu.
   */
  it("receber o total COM a mora é aceito — antes a própria porta recusava", async () => {
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await receber(parcela.id, 515).expect(200);
    const depois = await parcelaDe(parcela.id);
    // O principal recebe os R$ 500,00 DELE e quita; os R$ 15,00 viram a linha
    // de MORA, provada no caso seguinte. `valorRecebido` maior que o previsto
    // inflaria o caixa realizado da própria parcela.
    expect(Number(depois.valorRecebido)).toBe(500);
    expect(depois.status).toBe("PAGA");
  });

  /**
   * **A decisão da dona (13/08/2026), e o buraco que ela fechou.**
   *
   * Conta DERIVADA não sobrevive ao pagamento do principal: quem paga R$ 500,00
   * de uma dívida de R$ 515,00 zera o saldo aberto e, com ele, o acréscimo.
   * Medido antes da decisão: a parcela ficava **PARCIAL devendo R$ 15,00 que o
   * sistema dizia não existir** (`TypeError: Cannot read properties of null`
   * neste mesmo assert, porque `mora` voltava nula).
   *
   * A escolha foi quitar no principal — o balcão deu quitação, e é o que ele
   * faz — e cristalizar só o que entra a mais.
   */
  it("pagar só o principal QUITA, e a mora deixa de existir", async () => {
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await receber(parcela.id, 500).expect(200);
    const depois = await parcelaDe(parcela.id);
    expect(depois.status).toBe("PAGA");
    expect(await naFila(parcela.id)).toBeUndefined();
  });

  /** O que entra ALÉM do principal vira linha própria, PAGA, com a conta. */
  it("pagar o total cria a linha de MORA no carnê, já paga e com a conta escrita", async () => {
    const { contrato, parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await receber(parcela.id, 515).expect(200);

    const linhas = await db.select().from(parcelasTable)
      .where(and(eq(parcelasTable.contratoId, contrato.id), eq(parcelasTable.origem, "MORA")));
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0]!.valorPrevisto)).toBe(15);
    expect(Number(linhas[0]!.valorRecebido)).toBe(15);
    expect(linhas[0]!.status).toBe("PAGA");
    expect(linhas[0]!.descricao).toContain("cláusula 9ª");
    // O principal quita pelo PREVISTO, e não pelo total com acréscimo.
    expect(Number((await parcelaDe(parcela.id)).valorRecebido)).toBe(500);

    const [rastro] = await db.select().from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, linhas[0]!.id), eq(auditLogTable.acao, "MORA_RECEBIDA")));
    expect(rastro).toBeDefined();
    expect((rastro!.detalhe as { valor: number }).valor).toBe(15);
  });

  it("receber em partes: o pedaço menor vai todo ao principal, sem criar linha de mora", async () => {
    const { contrato, parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await receber(parcela.id, 300).expect(200);
    expect((await parcelaDe(parcela.id)).status).toBe("PARCIAL");
    expect(
      await db.select().from(parcelasTable)
        .where(and(eq(parcelasTable.contratoId, contrato.id), eq(parcelasTable.origem, "MORA"))),
    ).toHaveLength(0);
    // E a conta segue viva sobre o que sobrou.
    const mora = (await naFila(parcela.id))!.mora as Record<string, unknown>;
    expect(mora.saldo).toBe(200);
  });

  it("acima do total continua recusado, e a frase DIZ que há multa embutida", async () => {
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await receber(parcela.id, 600).expect(422).expect((res) => {
      expect(res.body.error).toBe("VALOR_ACIMA_DO_SALDO");
      expect(res.body.detalhe).toContain("515.00");
      expect(res.body.detalhe).toContain("cláusula 9ª");
    });
  });

  it("a parcela em dia continua com o teto do previsto — a 9ª não inventa saldo", async () => {
    const { parcela } = await parcelaCom({ vencimento: daquiADias(5) });
    await receber(parcela.id, 501).expect(422);
    await receber(parcela.id, 500).expect(200);
  });

  describe("o perdão — automático com gesto, e o gesto diz por quê", () => {
    it("perdoar zera o acréscimo e a conta continua VISÍVEL", async () => {
      const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
      const r = await perdoar(parcela.id, "Noiva avisou do problema no PIX").expect(200);
      expect((r.body.mora as Record<string, unknown>).perdoada).toBe(true);
      expect((r.body.mora as Record<string, unknown>).acrescimo).toBe(0);
      expect((r.body.mora as Record<string, unknown>).dias).toBe(30);
      expect(r.body.moraPerdoadaMotivo).toBe("Noiva avisou do problema no PIX");
    });

    it("perdoada, a porta volta a recusar acima do previsto", async () => {
      const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
      await perdoar(parcela.id, "cortesia").expect(200);
      await receber(parcela.id, 515).expect(422);
      await receber(parcela.id, 500).expect(200);
    });

    it("perdoar o que não é devido é 422 — selo de dívida que nunca existiu", async () => {
      const { parcela } = await parcelaCom({ vencimento: daquiADias(10) });
      await perdoar(parcela.id, "qualquer").expect(422).expect((res) => {
        expect(res.body.error).toBe("SEM_MORA");
      });
    });

    it("o motivo é obrigatório — perdão sem razão é o que a trilha não pode aceitar", async () => {
      const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
      await perdoar(parcela.id, "").expect(400);
    });

    it("restabelecer devolve a conta ao valor de HOJE, sem recalcular nada", async () => {
      const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
      await perdoar(parcela.id, "engano").expect(200);
      const r = await restabelecer(parcela.id).expect(200);
      expect((r.body.mora as Record<string, unknown>).perdoada).toBe(false);
      expect((r.body.mora as Record<string, unknown>).total).toBe(515);
      const depois = await parcelaDe(parcela.id);
      expect(depois.moraPerdoadaEm).toBeNull();
      expect(depois.moraPerdoadaMotivo).toBeNull();
    });

    /**
     * A trilha guarda as DUAS pontas, e o perdão guarda o número dispensado: ele
     * cresce todo dia, então quanto a decisão custou só existe aqui.
     */
    it("as duas pontas deixam rastro, e o perdão diz quanto foi dispensado", async () => {
      const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
      await perdoar(parcela.id, "primeira compra").expect(200);
      await restabelecer(parcela.id).expect(200);

      const linhas = await db
        .select()
        .from(auditLogTable)
        .where(eq(auditLogTable.entidadeId, parcela.id));
      const perdao = linhas.find((l) => l.acao === "MORA_PERDOADA");
      const volta = linhas.find((l) => l.acao === "MORA_RESTABELECIDA");
      expect(perdao).toBeDefined();
      expect(volta).toBeDefined();
      expect((perdao!.detalhe as { motivo: string }).motivo).toBe("primeira compra");
      expect((perdao!.detalhe as { acrescimoDispensado: number }).acrescimoDispensado).toBe(15);
    });

    it("parcela de outra loja é 404", async () => {
      await perdoar(randomUUID(), "x").expect(404);
    });
  });

  it("a parcela CANCELADA não deve mora — não é dívida, é linha que saiu da cobrança", async () => {
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await db.update(parcelasTable).set({ status: "CANCELADA" }).where(eq(parcelasTable.id, parcela.id));
    const r = await agent
      .get(`/api/lojas/${f.lojaId}/financeiro/parcelas`)
      .query({ de: hojeLocal(), ate: hojeLocal() })
      .expect(200);
    const achada = (r.body as { id: string; mora: unknown }[]).find((p) => p.id === parcela.id);
    if (achada) expect(achada.mora).toBeNull();
  });

  it("a parcela de contrato cancelado não quebra a fila", async () => {
    const { contrato, parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await db.update(contratosTable).set({ status: "CANCELADO", canceladoEm: new Date() })
      .where(eq(contratosTable.id, contrato.id));
    const achada = await naFila(parcela.id);
    // O contrato cancelado não apaga a parcela: ela segue vencida e a conta
    // continua sendo dita. Quem decide o destino dela é o cancelamento.
    expect(achada?.mora).not.toBeUndefined();
  });

  it("a fila devolve `moraPerdoadaEm` e o motivo, para a tela desenhar o selo", async () => {
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    await perdoar(parcela.id, "cliente antiga").expect(200);
    const achada = await naFila(parcela.id);
    expect(achada!.moraPerdoadaEm).not.toBeNull();
    expect(achada!.moraPerdoadaMotivo).toBe("cliente antiga");
  });

  it("não há registro de mora em parcela nenhuma antes do gesto", async () => {
    const { parcela } = await parcelaCom({ vencimento: diasAtras(30) });
    const linha = await parcelaDe(parcela.id);
    // A conta é DERIVADA: o banco não guarda o acréscimo, só o perdão.
    expect(linha.moraPerdoadaEm).toBeNull();
    expect(
      await db
        .select()
        .from(auditLogTable)
        .where(and(eq(auditLogTable.entidadeId, parcela.id), eq(auditLogTable.acao, "MORA_PERDOADA"))),
    ).toHaveLength(0);
  });
});
