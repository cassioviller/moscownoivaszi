import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, parcelasTable, contasPagarTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { teveRecebimento, hojeLocal } from "@workspace/financeiro-core";
import {
  criarContrato,
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E115 — o caixa conta o que FICOU, e o estorno limpa o que DESFEZ.
 *
 * **O 'manter' que sumia com o dinheiro (S5).** Cancelar um contrato com
 * `destinoPago: "manter"` — o default, documentado como "valor fica no caixa" —
 * virava a parcela PARCIAL em CANCELADA preservando `valorRecebido`, mas o
 * motor de caixa só contava PAGA/PARCIAL: os R$ 500,00 meio recebidos sumiam
 * RETROATIVAMENTE do fluxo, do DRE e da tendência, no dia em que entraram,
 * enquanto a PAGA irmã do MESMO cancelamento continuava contada. O mês nunca
 * mais batia com o extrato. VERMELHO ANTES: `expected 1000 to be 1500`.
 *
 * **O estorno que esquecia os carimbos.** O estorno em massa do cancelamento
 * zerava o recebimento e deixava `conciliadoEm` (o invariante escrito na
 * própria coluna: "o movimento deixou de existir não pode continuar
 * conferido") e `enviadoContabilidadeEm` para trás. E o carimbo de
 * contabilidade "vitalício" tinha um custo que o comentário do schema não via:
 * ele alimenta o `isNull` do próximo envio, então um recebimento estornado e
 * RE-LANÇADO nunca entrava em pacote nenhum — o pacote de julho saía
 * R$ 1.000,00 menor que o DRE de julho, sem aviso.
 *
 * **O valor que o servidor não pisava.** `valorRecebido: -700` passava pelo
 * único guard (o teto) e gravava −R$ 700,00 no caixa; `0` virava PARCIAL
 * "recebida" sem dinheiro. O piso morava só na tela.
 */
describe("E115 — o caixa conta o que ficou, o estorno limpa o que desfez", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  /** O perfil da vendedora não tem `financeiro` — fluxo, envio e pagamento vão pelo admin. */
  let agentFin: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    agentFin = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function contratoComParcelas(valores: number[]) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: valores.reduce((s, v) => s + v, 0),
      fechadoEm: new Date(),
    });
    const parcelas = [];
    for (let i = 0; i < valores.length; i++) {
      const [p] = await db
        .insert(parcelasTable)
        .values({
          id: randomUUID(),
          lojaId: f.lojaId,
          contratoId: contrato.id,
          numero: i + 1,
          valorPrevisto: valores[i],
          vencimento: dataFutura(10 + i),
          status: "PREVISTA",
        })
        .returning();
      parcelas.push(p);
    }
    return { contrato, parcelas };
  }

  function receber(parcelaId: string, valor: number) {
    return agent
      .post(`/api/lojas/${f.lojaId}/parcelas/${parcelaId}/receber`)
      .send({ valorRecebido: valor, recebidoEm: new Date().toISOString() });
  }

  function fluxoDeHoje() {
    const hoje = hojeLocal();
    return agentFin.get(`/api/lojas/${f.lojaId}/financeiro/fluxo?ini=${hoje}&fim=${hoje}`);
  }

  it("cancelar com 'manter' NÃO tira do caixa o que a PARCIAL já tinha recebido", async () => {
    const { contrato, parcelas } = await contratoComParcelas([1000, 1000]);
    await receber(parcelas[0].id, 1000).expect(200);
    await receber(parcelas[1].id, 500).expect(200);

    const antes = await fluxoDeHoje().expect(200);
    const entradasAntes = antes.body.resumo.entradas;

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "desistiu do vestido", destinoPago: "manter" })
      .expect(200);

    // VERMELHO ANTES: as entradas do dia caíam R$ 500,00 (1500 → 1000) — o
    // dinheiro que o 'manter' diz que fica sumia do realizado retroativamente.
    const depois = await fluxoDeHoje().expect(200);
    expect(depois.body.resumo.entradas).toBe(entradasAntes);

    // E a linha continua dizendo o que aconteceu: cancelada, com o recebido.
    const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelas[1].id));
    expect(linha.status).toBe("CANCELADA");
    expect(linha.valorRecebido).toBe(500);
  });

  it("cancelar com 'estornar' limpa conciliadoEm E enviadoContabilidadeEm", async () => {
    const { contrato, parcelas } = await contratoComParcelas([1000]);
    await receber(parcelas[0].id, 1000).expect(200);
    // Conferida com o extrato e declarada à contadora — os dois carimbos.
    await db
      .update(parcelasTable)
      .set({ conciliadoEm: new Date(), enviadoContabilidadeEm: new Date() })
      .where(eq(parcelasTable.id, parcelas[0].id));

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "devolvemos o sinal", destinoPago: "estornar" })
      .expect(200);

    const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelas[0].id));
    expect(linha.status).toBe("CANCELADA");
    expect(linha.valorRecebido).toBeNull();
    // VERMELHO ANTES: os dois carimbos sobreviviam ao estorno em massa — o
    // banco afirmava que um recebimento devolvido "bateu com o extrato".
    expect(linha.conciliadoEm).toBeNull();
    expect(linha.enviadoContabilidadeEm).toBeNull();
  });

  it("recebimento estornado e re-lançado ENTRA na declaração seguinte", async () => {
    const hoje = hojeLocal();
    const { parcelas } = await contratoComParcelas([1000]);
    await receber(parcelas[0].id, 1000).expect(200);

    // Junho é declarado (aqui: a janela de hoje).
    await agentFin
      .post(`/api/lojas/${f.lojaId}/financeiro/contabilidade/enviar`)
      .send({ de: hoje, ate: hoje })
      .expect(200);
    const [declarada] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelas[0].id));
    expect(declarada.enviadoContabilidadeEm).not.toBeNull();

    // O estorno desfaz o recebimento — e o carimbo, que é operacional: ele
    // alimenta o isNull do próximo envio. O que a contadora já recebeu é
    // história e mora na trilha, não neste campo.
    await agent.post(`/api/lojas/${f.lojaId}/parcelas/${parcelas[0].id}/estornar`).expect(200);
    const [estornada] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelas[0].id));
    // VERMELHO ANTES: o carimbo era "vitalício" e ficava.
    expect(estornada.enviadoContabilidadeEm).toBeNull();

    // Re-lançada, a parcela é declarada DE NOVO no pacote seguinte.
    await receber(parcelas[0].id, 1000).expect(200);
    await agentFin
      .post(`/api/lojas/${f.lojaId}/financeiro/contabilidade/enviar`)
      .send({ de: hoje, ate: hoje })
      .expect(200);
    const [redeclarada] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelas[0].id));
    // VERMELHO ANTES: pulada pelo isNull para sempre — R$ 1.000,00 fora do
    // pacote de julho, que saía menor que o DRE do mesmo mês.
    expect(redeclarada.enviadoContabilidadeEm).not.toBeNull();
  });

  it("receber valor não-positivo é recusado na borda, e a parcela fica intocada", async () => {
    const { parcelas } = await contratoComParcelas([1000]);

    // VERMELHO ANTES: 200, status PARCIAL, valorRecebido −700 — o caixa somava
    // −R$ 700,00 às entradas e o saldo aberto virava R$ 1.700,00.
    const negativo = await receber(parcelas[0].id, -700).expect(400);
    expect(negativo.body.error).toBe("CORPO_INVALIDO");
    expect(negativo.body.campos?.some((c: { campo: string }) => c.campo === "valorRecebido")).toBe(true);

    // VERMELHO ANTES: 200, PARCIAL "recebida" sem nenhum dinheiro.
    await receber(parcelas[0].id, 0).expect(400);

    const [linha] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelas[0].id));
    expect(linha.status).toBe("PREVISTA");
    expect(linha.valorRecebido).toBeNull();
  });

  it("pagar conta com valor não-positivo é recusado na borda", async () => {
    const [conta] = await db
      .insert(contasPagarTable)
      .values({
        id: randomUUID(),
        lojaId: f.lojaId,
        tipo: "DESPESA",
        descricao: "Aluguel de teste",
        valorPrevisto: 100,
        vencimento: dataFutura(5),
        status: "PREVISTA",
      })
      .returning();

    // VERMELHO ANTES: a saída negativa entrava no caixa como dinheiro voltando.
    const r = await agentFin
      .post(`/api/lojas/${f.lojaId}/contas-pagar/${conta.id}/pagar`)
      .send({ data: new Date().toISOString(), valorPago: -50 })
      .expect(400);
    expect(r.body.error).toBe("CORPO_INVALIDO");
  });

  describe("a régua do recebimento pergunta ao dinheiro, não ao status", () => {
    it("CANCELADA com dinheiro mantido TEM recebimento; sem dinheiro, não", () => {
      const agora = new Date();
      // As parcelas carregam o status junto — e a régua nova não olha para
      // ele: quem responde é o RECEBIMENTO (recebidoEm + valorRecebido).
      const canceladaComDinheiro = { status: "CANCELADA", recebidoEm: agora, valorRecebido: 500 };
      const canceladaEstornada = { status: "CANCELADA", recebidoEm: null, valorRecebido: null };
      const paga = { status: "PAGA", recebidoEm: agora, valorRecebido: 1000 };
      const parcial = { status: "PARCIAL", recebidoEm: agora, valorRecebido: 300 };
      const prevista = { status: "PREVISTA", recebidoEm: null, valorRecebido: null };
      // VERMELHO ANTES: false — a régua era uma lista de status, e a CANCELADA
      // de um 'manter' guarda dinheiro que entrou e ficou.
      expect(teveRecebimento(canceladaComDinheiro)).toBe(true);
      expect(teveRecebimento(canceladaEstornada)).toBe(false);
      expect(teveRecebimento(paga)).toBe(true);
      expect(teveRecebimento(parcial)).toBe(true);
      expect(teveRecebimento(prevista)).toBe(false);
    });
  });
});
