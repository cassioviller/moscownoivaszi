import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, bloqueioVestidosTable, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  criarVestido,
  criarBloqueio,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";
import { relogio } from "../lib/relogio";
import { diaDaSemana, diaLocal } from "@workspace/financeiro-core";

/**
 * E219 — a troca de traje tem prazo (cláusula 17ª caput e §1º), NA PORTA.
 *
 * A régua pura vive em `financeiro-core/src/troca.ts` e os sete dias da semana
 * estão pregados lá (`troca.test.ts` do frontend). Aqui o que se prova é que a
 * PORTA do E223 a aplica — e a data do gesto vem de `relogio.agora()`, que o
 * teste fixa: regra que decide por dia da semana não pode depender do dia em
 * que a suíte roda (S-O119).
 */
describe("E219 — a guarda da 17ª na porta de trocar peça", () => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Contrato SEM orçamento (a guarda não depende de item), preso a uma reserva. */
  async function vendaFechada() {
    const lead = await criarLead(f);
    const vestidoA = await criarVestido(f);
    const bloqueioA = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestidoA.id,
      leadId: lead.id,
      casamentoData: dataFutura(90),
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        bloqueioVestidoIds: [bloqueioA.id],
      })
      .expect(201);
    return { bloqueioA, contratoId: criado.body.id as string };
  }

  /** O próximo dia, a partir de amanhã, cujo dia da semana é `alvo` (0–6). */
  function proximoDia(alvo: number): Date {
    for (let n = 1; n <= 7; n++) {
      const candidato = new Date(Date.now() + n * 86_400_000);
      if (diaDaSemana(diaLocal(candidato)) === alvo) return candidato;
    }
    throw new Error("uma semana tem sete dias");
  }

  it("contrato fechado há 10 dias: 422 TROCA_FORA_DO_PRAZO, e a frase diz a convenção", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    await db.update(contratosTable)
      .set({ fechadoEm: new Date(Date.now() - 10 * 86_400_000) })
      .where(eq(contratosTable.id, contratoId));
    const vestidoB = await criarVestido(f);

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(422);
    expect(r.body.error).toBe("TROCA_FORA_DO_PRAZO");
    expect(r.body.detalhe).toContain("conta do fecho do contrato");

    // E nada se moveu: a reserva antiga segue viva.
    const [antiga] = await db.select().from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueioA.id));
    expect(antiga!.canceladoEm).toBeNull();
  });

  it("numa sexta-feira, dentro do prazo: 422 TROCA_EM_DIA_VEDADO (§1º)", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    const vestidoB = await criarVestido(f);
    // O gesto acontece na próxima sexta — no máximo 7 dias após o fecho de
    // hoje, então o prazo do caput NÃO morde e o §1º é o único veto.
    vi.spyOn(relogio, "agora").mockReturnValue(proximoDia(5));

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(422);
    expect(r.body.error).toBe("TROCA_EM_DIA_VEDADO");
    expect(r.body.detalhe).toContain("sexta");
  });

  it("numa quarta-feira, dentro do prazo: a troca passa", async () => {
    const { bloqueioA, contratoId } = await vendaFechada();
    const vestidoB = await criarVestido(f);
    vi.spyOn(relogio, "agora").mockReturnValue(proximoDia(3));

    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(200);
    expect(r.body.vestidoNovoId).toBe(vestidoB.id);
  });
});
