import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, parcelasTable } from "@workspace/db";
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
 * E110 — a cobrança de avaria não colide com a ENTRADA do contrato.
 *
 * `POST /avarias/:id/cobrar` inseria a parcela com `numero: 0` fixo, com o
 * comentário "fora da numeração do carnê". O 0 NÃO é fora da numeração: é a
 * ENTRADA, e está escrito no motor —
 *
 *     lib/financeiro-core/src/plano.ts:27   /** `numero` 0 é a entrada. *​/
 *
 * — enquanto `parcelas` tem `unique(contratoId, numero)`. Contrato com entrada
 * + cobrança de reparo = 23505 dentro da transação, e a cobrança nunca acontece.
 *
 * Por que a suíte do E97 não pegava: os SETE testes de lá criam o contrato pelo
 * helper e nunca geram o plano, então o slot 0 está sempre livre. O `e2e/48` faz
 * o mesmo. O defeito mora exatamente no caso que ninguém montava.
 *
 * A rota irmã, do mesmo épico E71, sempre fez certo (`contratos.ts:874`):
 * `max(numero) + 1`.
 */
describe("E110 — a avaria entra depois da entrada, nunca por cima dela", () => {
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

  const parcelasDe = (contratoId: string) =>
    db.select().from(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));

  /** Uma noiva com bloqueio, contrato ATIVO e uma avaria com custo. */
  async function noivaComAvaria(custoReparo = 350) {
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
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Barra rasgada", custoReparo })
      .expect(201);
    return { avaria: r.body as { id: string }, contrato, lead };
  }

  /** O carnê de verdade: entrada (numero 0) + N parcelas. */
  async function gerarPlano(contratoId: string, entrada = 1000, numParcelas = 4) {
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
      .send({ entrada, numParcelas, primeiroVencimento: dataFutura(30).toISOString().slice(0, 10) })
      .expect(201);
  }

  it("contrato COM entrada aceita a cobrança do reparo — era 500 por colisão de UNIQUE", async () => {
    const { avaria, contrato } = await noivaComAvaria(350);
    await gerarPlano(contrato.id, 1000, 4);

    // R$ 1.000,00 de entrada no slot 0 + R$ 350,00 de reparo: cinco linhas de
    // plano e a sexta é o reparo. Antes do conserto, esta chamada era 500.
    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);

    const parcelas = await parcelasDe(contrato.id);
    expect(parcelas).toHaveLength(6);

    const entrada = parcelas.find((p) => p.numero === 0)!;
    expect(entrada.valorPrevisto).toBe(1000);
    expect(entrada.descricao).not.toContain("Reparo de avaria");

    const reparo = parcelas.find((p) => p.descricao?.startsWith("Reparo de avaria"))!;
    expect(reparo.valorPrevisto).toBe(350);
    expect(reparo.numero).toBe(5); // max(0..4) + 1
  });

  it("a SEGUNDA avaria do mesmo contrato também entra — cada uma no seu número", async () => {
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

    const primeira = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Barra rasgada", custoReparo: 200 })
      .expect(201);
    const segunda = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Renda solta", custoReparo: 150 })
      .expect(201);

    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${primeira.body.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);
    // Sem plano nenhum, as duas disputavam o MESMO slot 0.
    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${segunda.body.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);

    const parcelas = await parcelasDe(contrato.id);
    expect(parcelas).toHaveLength(2);
    expect(new Set(parcelas.map((p) => p.numero)).size).toBe(2);
    // Nenhuma das duas ocupa o slot da entrada.
    expect(parcelas.every((p) => p.numero > 0)).toBe(true);
  });

  it("a cobrança não pode cair no contrato de OUTRA noiva da mesma loja", async () => {
    const { avaria } = await noivaComAvaria(400);

    // Outra noiva, outro contrato — mesma loja, tudo válido por si.
    const outraNoiva = await criarLead(f);
    const contratoDaOutra = await criarContrato(f, {
      leadId: outraNoiva.id,
      valorTotal: 8000,
      fechadoEm: dataFutura(-10),
    });

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.id}/cobrar`)
      .send({ contratoId: contratoDaOutra.id })
      .expect(422);
    expect(r.body.error).toBe("AVARIA_DE_OUTRA_NOIVA");

    // O que importa: o carnê da outra noiva não foi tocado.
    expect(await parcelasDe(contratoDaOutra.id)).toHaveLength(0);
  });
});
