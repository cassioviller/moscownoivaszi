import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cabinesTable, db } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-O22 — **a tela de cabines baixava a agenda futura INTEIRA para produzir um
 * número por cabine.**
 *
 * O G6/E168 fez o Switch de desativar dizer quanta agenda fica na cabine —
 * conserto certo, feito pelo lado caro: `useListAtendimentos({ de: hoje })` no
 * carregamento da tela, e a conta em memória. Com três anos de loja são
 * milhares de linhas na rede para responder *"quantos ficam nesta"*, e a
 * resposta só interessa no instante em que alguém clica em desativar.
 *
 * É a **lente 3** (E62/D4): o recorte existe no banco, e a tela não o pedia
 * porque ele não existia. Os irmãos `leadId` (E125) e `bloqueioId` (E79)
 * nasceram do mesmo raciocínio; faltava este.
 */
describe("S-O22 — o recorte por cabine", () => {
  let f: Fixture;
  let cabineA: string;
  let cabineB: string;

  beforeAll(async () => {
    f = await criarFixture();
    const [a] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, nome: `Cabine A ${randomUUID().slice(0, 6)}` })
      .returning();
    const [b] = await db
      .insert(cabinesTable)
      .values({ id: randomUUID(), lojaId: f.lojaId, nome: `Cabine B ${randomUUID().slice(0, 6)}` })
      .returning();
    cabineA = a!.id;
    cabineB = b!.id;

    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    // Três na A, uma na B — e o número que a tela mostra é o da cabine, não o
    // da loja.
    for (const [i, cabineId] of [cabineA, cabineA, cabineA, cabineB].entries()) {
      await agent
        .post(`/api/lojas/${f.lojaId}/atendimentos`)
        .send({
          leadId: lead.id,
          cabineId,
          vendedoraId: f.vendedoraId,
          inicio: dataFutura(10 + i).toISOString(),
        })
        .expect(201);
    }
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("`?cabineId=` devolve só os daquela cabine", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const a = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos`)
      .query({ cabineId: cabineA })
      .expect(200);
    expect(a.body).toHaveLength(3);
    expect(a.body.every((x: { cabineId: string }) => x.cabineId === cabineA)).toBe(true);

    const b = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos`)
      .query({ cabineId: cabineB })
      .expect(200);
    expect(b.body).toHaveLength(1);
  });

  it("compõe com a janela — é assim que a tela pergunta", async () => {
    // A tela de cabines pede exatamente isto: a cabine, do dia de hoje em
    // diante. O que já aconteceu é história e não muda a decisão de quem
    // desativa.
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const r = await agent
      .get(`/api/lojas/${f.lojaId}/atendimentos`)
      .query({ cabineId: cabineA, de: new Date().toISOString().slice(0, 10) })
      .expect(200);
    expect(r.body).toHaveLength(3);
  });

  it("sem o filtro, a agenda da loja segue inteira — o recorte não mudou o default", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const r = await agent.get(`/api/lojas/${f.lojaId}/atendimentos`).expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(4);
  });
});
