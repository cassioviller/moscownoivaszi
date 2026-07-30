import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  contasPagarTable,
  pagamentosTable,
  saldosReferenciaTable,
  parcelasTable,
  contratosTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, hojeLocal } from "@workspace/financeiro-core";
import {
  criarFixture,
  criarContrato,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E46 — `GET /financeiro/alerta-caixa`. O núcleo puro já está provado em
 * `alerta-caixa-unit`; aqui o que se prova é a LIGAÇÃO com o banco, que é onde
 * este endpoint pode mentir em silêncio:
 *
 *  - o recorte SQL não pode cortar o que a curva precisa nem arrastar o que ela
 *    ignora (as duas janelas correm em eixos diferentes: instante × vencimento);
 *  - a âncora escolhida é a mais recente que não está no futuro;
 *  - o gate do módulo financeiro vale para esta rota como para as outras.
 *
 * As datas nascem de `hojeLocal()` porque o endpoint decide o horizonte a
 * partir de HOJE — datas fixas parariam de valer amanhã.
 */

const HOJE = hojeLocal();

/** Data de negócio: meio-dia SP, a convenção de `vencimento` no banco. */
const negocio = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

describe("Alerta de caixa (API)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);
  });

  afterEach(async () => {
    await db.delete(parcelasTable).where(eq(parcelasTable.lojaId, f.lojaId));
    await db.delete(contratosTable).where(eq(contratosTable.lojaId, f.lojaId));
    await db.delete(contasPagarTable).where(eq(contasPagarTable.lojaId, f.lojaId));
    await db.delete(pagamentosTable).where(eq(pagamentosTable.lojaId, f.lojaId));
    await db.delete(saldosReferenciaTable).where(eq(saldosReferenciaTable.lojaId, f.lojaId));
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function conta(dia: string, valor: number): Promise<void> {
    await db.insert(contasPagarTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      tipo: "DESPESA",
      descricao: `Despesa vencendo em ${dia}`,
      valorPrevisto: valor,
      vencimento: negocio(dia),
    });
  }

  async function conferirSaldo(dia: string, valor: number): Promise<void> {
    await db.insert(saldosReferenciaTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      dataReferencia: negocio(dia),
      valor,
    });
  }

  /**
   * Uma parcela num contrato ativo — o que faltava nesta fixture. Sem ela o
   * arquivo inteiro exercitava só contas a pagar e saldo de referência, e a
   * perna de `parcelasTable` do SQL (onde o C4 mora) nunca era tocada.
   */
  async function parcela(params: {
    status: "PREVISTA" | "PARCIAL" | "PAGA";
    vencimento: string;
    valorPrevisto: number;
    valorRecebido?: number;
    recebidoEm?: string;
  }): Promise<void> {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: params.valorPrevisto,
      fechadoEm: negocio(addDias(HOJE, -30)),
    });
    await db.insert(parcelasTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      numero: 0,
      valorPrevisto: params.valorPrevisto,
      vencimento: negocio(params.vencimento),
      status: params.status,
      valorRecebido: params.valorRecebido ?? null,
      recebidoEm: params.recebidoEm ? new Date(`${params.recebidoEm}T15:00:00-03:00`) : null,
    });
  }

  const buscar = async () =>
    (await agent.get(`/api/lojas/${f.lojaId}/financeiro/alerta-caixa`).expect(200)).body;

  const buscarFluxo = async () =>
    (await agent.get(`/api/lojas/${f.lojaId}/financeiro/fluxo`).expect(200)).body;

  it("sem saldo conferido não há alerta — nem com o caixa fadado a furar", async () => {
    await conta(addDias(HOJE, 3), 50_000);

    expect(await buscar()).toEqual({
      ancorado: false,
      saldoHoje: null,
      diaNegativo: null,
      menorSaldo: null,
      horizonteDias: 30,
    });
  });

  it("com saldo conferido, aponta o dia em que o caixa vira", async () => {
    await conferirSaldo(addDias(HOJE, -2), 1_000);
    await conta(addDias(HOJE, 5), 3_000);

    const alerta = await buscar();
    expect(alerta).toMatchObject({
      ancorado: true,
      saldoHoje: 1_000,
      diaNegativo: addDias(HOJE, 5),
      menorSaldo: { dia: addDias(HOJE, 5), valor: -2_000 },
    });
  });

  it("o que vence além do horizonte fica fora da conta", async () => {
    await conferirSaldo(addDias(HOJE, -2), 1_000);
    await conta(addDias(HOJE, 45), 90_000);

    const alerta = await buscar();
    expect(alerta.ancorado).toBe(true);
    expect(alerta.diaNegativo).toBeNull();
    // O piso é o próprio saldo de hoje: nada dentro do horizonte o derruba.
    expect(alerta.menorSaldo).toEqual({ dia: null, valor: 1_000 });
  });

  it("o pagamento feito desde a âncora derruba o saldo de partida", async () => {
    await conferirSaldo(addDias(HOJE, -2), 5_000);
    await db.insert(pagamentosTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      data: new Date(`${HOJE}T10:00:00-03:00`),
      valorPago: 4_500,
    });
    await conta(addDias(HOJE, 7), 1_000);

    const alerta = await buscar();
    // Partir da âncora crua (5.000) esconderia o furo: sobram 500.
    expect(alerta.saldoHoje).toBe(500);
    expect(alerta.diaNegativo).toBe(addDias(HOJE, 7));
  });

  it("vale a âncora mais recente, e o dia reconferido corrige em vez de empilhar", async () => {
    await conferirSaldo(addDias(HOJE, -10), 90_000);
    await conferirSaldo(addDias(HOJE, -1), 2_000);
    await conta(addDias(HOJE, 4), 2_500);

    const alerta = await buscar();
    expect(alerta.saldoHoje).toBe(2_000);
    expect(alerta.diaNegativo).toBe(addDias(HOJE, 4));
  });

  it("a âncora do futuro não vale: o caixa de amanhã ainda não foi conferido", async () => {
    await conferirSaldo(addDias(HOJE, 3), 80_000);
    await conta(addDias(HOJE, 6), 1_000);

    // A única âncora está no futuro — para este endpoint é o mesmo que não ter.
    const alerta = await buscar();
    expect(alerta.ancorado).toBe(false);
    expect(alerta.diaNegativo).toBeNull();
  });

  /**
   * C4/E94 — o SQL desta rota filtrava as parcelas por `status = 'PAGA'` (perna
   * do saldo) e `status = 'PREVISTA'` (perna da curva). A PARCIAL não é nenhuma
   * das duas: uma parcela meio recebida não chegava ao motor NEM como dinheiro
   * que entrou NEM como dinheiro que vai entrar. O motor sempre soube tratá-la
   * (`teveRecebimento`/`estaAberta` em financeiro-core, provados em
   * `alerta-caixa-unit`) — ele só nunca recebia a linha.
   */
  describe("a parcela PARCIAL (C4)", () => {
    it("o recebido de uma PARCIAL entra no saldo de hoje", async () => {
      await conferirSaldo(addDias(HOJE, -2), 1_000);
      // 10.000 previstos, 4.000 já na conta, recebidos hoje.
      await parcela({
        status: "PARCIAL",
        vencimento: addDias(HOJE, 10),
        valorPrevisto: 10_000,
        valorRecebido: 4_000,
        recebidoEm: HOJE,
      });

      const alerta = await buscar();
      // Sem a PARCIAL na perna do saldo, o alerta diria 1.000 — e a loja teria
      // 5.000 no banco.
      expect(alerta.saldoHoje).toBe(5_000);
    });

    it("o que FALTA numa PARCIAL entra na curva e cala o alarme falso", async () => {
      await conferirSaldo(addDias(HOJE, -2), 0);
      await parcela({
        status: "PARCIAL",
        vencimento: addDias(HOJE, 5),
        valorPrevisto: 10_000,
        valorRecebido: 4_000,
        recebidoEm: HOJE,
      });
      await conta(addDias(HOJE, 6), 9_000);

      const alerta = await buscar();
      // 4.000 (recebido) +6.000 (o que falta, no dia 5) −9.000 (dia 6) = 1.000.
      // Com a PARCIAL fora das duas pernas o alerta enxergaria 0 −9.000 e
      // anunciaria um furo de 9.000 que não existe.
      expect(alerta.saldoHoje).toBe(4_000);
      expect(alerta.diaNegativo).toBeNull();
      expect(alerta.menorSaldo).toEqual({ dia: addDias(HOJE, 6), valor: 1_000 });
    });

    it("o alerta e o /financeiro/fluxo contam o MESMO a receber", async () => {
      // O assert cruzado do épico: dois endpoints, duas queries, uma verdade.
      // Era aqui que a loja via o sino gritar e a projeção, clicada no segundo
      // seguinte, mostrar o caixa positivo — sem que nenhum dos dois números
      // explicasse o outro.
      await conferirSaldo(addDias(HOJE, -2), 0);
      await parcela({
        status: "PARCIAL",
        vencimento: addDias(HOJE, 5),
        valorPrevisto: 10_000,
        valorRecebido: 4_000,
        recebidoEm: HOJE,
      });
      await parcela({
        status: "PREVISTA",
        vencimento: addDias(HOJE, 8),
        valorPrevisto: 2_000,
      });

      const fluxo = await buscarFluxo();
      // O fluxo já contava a PARCIAL pelo SALDO (6.000) desde o E49.
      expect(fluxo.horizonte.aReceber).toBe(8_000);

      // E o alerta precisa chegar ao mesmo total: saldo 4.000 + 8.000 a receber
      // dentro do horizonte, sem nada a pagar, o piso é o próprio começo.
      const alerta = await buscar();
      expect(alerta.saldoHoje).toBe(4_000);
      expect(alerta.menorSaldo).toEqual({ dia: null, valor: 4_000 });

      // A prova direta de que as duas rotas veem o mesmo dinheiro: uma conta a
      // pagar de 12.000 depois de tudo entrar ainda deixa o caixa positivo em
      // 4.000 + 8.000 − 12.000 = 0 — e nunca negativo.
      await conta(addDias(HOJE, 20), 12_000);
      const depois = await buscar();
      expect(depois.diaNegativo).toBeNull();
      expect(depois.menorSaldo).toEqual({ dia: addDias(HOJE, 20), valor: 0 });
    });
  });

  it("quem não tem o módulo financeiro não recebe o alerta", async () => {
    // O perfil da fixture dá leads/vestidos/agenda — financeiro não.
    const semFinanceiro = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await semFinanceiro.get(`/api/lojas/${f.lojaId}/financeiro/alerta-caixa`).expect(403);
  });
});
