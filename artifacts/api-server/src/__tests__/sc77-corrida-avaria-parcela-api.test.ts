import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, parcelasTable, avariasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-C77 — a corrida do par avarias+parcelas, exercitada de verdade.
 *
 * O `PATCH /avarias/:id` (S-C11) é a transação que tranca o par: `FOR UPDATE`
 * na avaria (`reservas.ts:2932`) e depois — **condicional**, só quando
 * `avaria.parcelaId` existe — `FOR UPDATE` na parcela (`:2948`). Nenhuma
 * corrida `sm7` exercitava o segundo degrau, e é ele que impede o pior
 * desencontro do módulo: a ficha dizendo um custo e o carnê PAGO dizendo
 * outro — "dois números para uma decisão só" (E186), agora com dinheiro
 * recebido no meio.
 *
 * A cena, determinística como a do sm7 (nada de sleep-e-reza): a segunda
 * conexão segura um recebimento NÃO COMMITADO na parcela do reparo — o
 * UPDATE dela tranca a linha —, e o PATCH da correção fica pendurado no
 * `FOR UPDATE` da parcela até o commit. Quando acorda, relê a linha FRESCA,
 * vê o dinheiro e recusa: 409 `AVARIA_COM_RECEBIMENTO`, e nem a avaria nem a
 * parcela mudam um centavo.
 *
 * VERMELHO ANTES (regra 34, código quebrado de propósito — o `.for("update")`
 * da parcela removido): `expected 409 "Conflict", got 200 "OK"` — o SELECT
 * sem tranca lê o retrato de ANTES do recebimento (MVCC), o PATCH decide
 * sobre ele, o CAS `isNull(recebidoEm)` do repasse vira zero linhas em
 * silêncio, e o par diverge: **avaria R$ 150,00 · parcela PAGA de
 * R$ 250,00** — exatamente o estado que a tranca existe para impedir.
 */
describe("S-C77 — o recebimento em voo segura a parcela, e a correção da avaria espera e desiste", () => {
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

  /** Avaria cobrada: parcela viva de R$ 250,00 presa pelo vínculo do E97. */
  async function avariaCobrada() {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-5),
    });
    const a = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Barra rasgada", custoReparo: 250 })
      .expect(201);
    const cobrada = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${a.body.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);
    return { avariaId: a.body.id as string, parcelaId: cobrada.body.parcelaId as string };
  }

  it("o recebimento não commitado tranca a parcela; a correção vê o dinheiro e recusa — 409, par intacto", async () => {
    const { avariaId, parcelaId } = await avariaCobrada();

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      // O "receber" em voo: a linha da parcela fica trancada até o COMMIT.
      await cliente.query(
        `UPDATE parcelas SET valor_recebido = 250, recebido_em = now(), status = 'PAGA'
          WHERE id = $1`,
        [parcelaId],
      );

      // O `Test` do supertest é LAZY (S33): o Promise.resolve dispara AGORA, e
      // a rota fica pendurada no FOR UPDATE da parcela.
      const respostaP = Promise.resolve(
        agent
          .patch(`/api/lojas/${f.lojaId}/avarias/${avariaId}`)
          .send({ custoReparo: 150 }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("COMMIT");

      const resposta = await respostaP;
      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe("AVARIA_COM_RECEBIMENTO");
    } finally {
      cliente.release();
    }

    // O invariante, medido no banco: o par não divergiu — a ficha e o carnê
    // dizem o MESMO número, e o número é o que o dinheiro pagou.
    const [avaria] = await db
      .select({ custoReparo: avariasTable.custoReparo })
      .from(avariasTable)
      .where(eq(avariasTable.id, avariaId));
    const [parcela] = await db
      .select({ valorPrevisto: parcelasTable.valorPrevisto, status: parcelasTable.status })
      .from(parcelasTable)
      .where(eq(parcelasTable.id, parcelaId));
    expect(avaria.custoReparo).toBe(250);
    expect(parcela.valorPrevisto).toBe(250);
    expect(parcela.status).toBe("PAGA");
  });

  it("sem corrida, a correção segue valendo: 200 e a parcela viva segue o número", async () => {
    const { avariaId, parcelaId } = await avariaCobrada();

    await agent
      .patch(`/api/lojas/${f.lojaId}/avarias/${avariaId}`)
      .send({ custoReparo: 150 })
      .expect(200);

    const [avaria] = await db
      .select({ custoReparo: avariasTable.custoReparo })
      .from(avariasTable)
      .where(eq(avariasTable.id, avariaId));
    const [parcela] = await db
      .select({ valorPrevisto: parcelasTable.valorPrevisto })
      .from(parcelasTable)
      .where(eq(parcelasTable.id, parcelaId));
    expect(avaria.custoReparo).toBe(150);
    expect(parcela.valorPrevisto).toBe(150);
  });
});
