import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { contratoItensTable, db, parcelasTable } from "@workspace/db";
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
 * **S-C150 — a conta a pagar que o E217 cria não passava pela porta que a
 * lista.**
 *
 * O E217 acrescentou `DEVOLUCAO` ao enum `ContaPagarTipo` do `openapi.yaml` e
 * **não re-rodou o codegen**: `lib/api-zod/src/generated` continuou com os
 * quatro tipos antigos, e é ele que o `GET /financeiro/contas-pagar` usa para
 * serializar (`financeiro.ts:219`). Cancelar um contrato com devolução criava a
 * conta e, a partir daí, a tela "Pagar" da loja respondia **500** — o zod
 * recusava a própria linha que o sistema tinha acabado de gravar.
 *
 * Achado ao re-rodar o codegen pela S-C140. A régua que existe para pegar isto
 * é o `_cobreTodosOsTipos` de `moscow-noivas/src/lib/financeiro/dre.ts`, que
 * quebra o typecheck quando nasce um tipo sem rótulo PT-BR — **ela nunca viu o
 * tipo novo, porque o generated não mudou.** A conclusão que vale para o
 * repositório: *guarda que depende do codegen só protege depois de o codegen
 * rodar.*
 */
describe("S-C150 — a devolução da rescisão aparece na lista de contas a pagar", () => {
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

  it("**cancelar com R$ 400 a devolver não derruba a tela Pagar**", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 3000, fechadoEm: new Date() });
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      tipo: "VESTIDO",
      vestidoId: vestido.id,
      descricao: vestido.nome,
      valorUnitario: 3000,
      quantidade: 1,
    });
    for (const [numero, valor] of [[0, 1200], [1, 1000]] as const) {
      await db.insert(parcelasTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        numero,
        origem: "PLANO",
        descricao: numero === 0 ? "Entrada" : "Parcela 1",
        valorPrevisto: valor,
        valorRecebido: valor,
        status: "PAGA",
        recebidoEm: new Date(),
        vencimento: new Date(),
      });
    }
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "A noiva desistiu" })
      .expect(200);

    // `origemContratoId` não viaja no payload da lista (é coluna, não campo do
    // spec), então a linha se acha pelo tipo — que é justamente o que o zod
    // desatualizado recusava.
    const r = await agent.get(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`).expect(200);
    const devolucao = (r.body as { tipo: string; valorPrevisto: number }[]).find(
      (c) => c.tipo === "DEVOLUCAO",
    );
    expect(devolucao, "a conta a pagar da 13ª §3º sumiu da lista").toBeDefined();
    expect(devolucao?.valorPrevisto).toBe(400);
  });
});
