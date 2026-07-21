import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, contasPagarTable, pagamentosTable, saldosReferenciaTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, hojeLocal } from "@workspace/financeiro-core";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

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

  const buscar = async () =>
    (await agent.get(`/api/lojas/${f.lojaId}/financeiro/alerta-caixa`).expect(200)).body;

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

  it("quem não tem o módulo financeiro não recebe o alerta", async () => {
    // O perfil da fixture dá leads/vestidos/agenda — financeiro não.
    const semFinanceiro = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await semFinanceiro.get(`/api/lojas/${f.lojaId}/financeiro/alerta-caixa`).expect(403);
  });
});
