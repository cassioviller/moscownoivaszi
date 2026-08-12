import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  type Fixture,
} from "./helpers";

/**
 * E128 (C7) — a prévia da LGPD conta ANTES o que o expurgo faria.
 *
 * O diálogo dizia o QUE se perde mas não QUANTAS: a contagem só chegava no
 * toast, DEPOIS do clique irreversível — a dona confirmava às cegas se eram 3
 * ou 300. A prévia é read-only e usa a MESMA condição do expurgo
 * (`condicaoDoExpurgo`, uma escrita só): o cuidado (a) do backlog é que a
 * contagem da prévia BATA com a do expurgo real na mesma fixture — é o que
 * este arquivo prova.
 */
describe("Prévia do expurgo LGPD (E128)", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let antigas: string[];

  beforeAll(async () => {
    f = await criarFixture();
    // E172: prévia e expurgo pedem `admin` desde que a porta se alinhou com a
    // tela; a vendedora da fixture não tem o módulo.
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    const a1 = await criarLead(f);
    const a2 = await criarLead(f);
    const recente = await criarLead(f);
    const jaAnonimizada = await criarLead(f);
    antigas = [a1.id, a2.id];

    const tresAnosAtras = new Date();
    tresAnosAtras.setFullYear(tresAnosAtras.getFullYear() - 3);
    await db.update(leadsTable)
      .set({ etapa: "PERDIDO", perdidaEm: tresAnosAtras, whatsapp: "(11) 97777-1111" })
      .where(inArray(leadsTable.id, antigas));
    await db.update(leadsTable)
      .set({ etapa: "PERDIDO", perdidaEm: new Date() })
      .where(eq(leadsTable.id, recente.id));
    // Já anonimizada não conta de novo — o recorte exclui `anonimizadaEm`.
    await db.update(leadsTable)
      .set({ etapa: "PERDIDO", perdidaEm: tresAnosAtras, anonimizadaEm: new Date() })
      .where(eq(leadsTable.id, jaAnonimizada.id));
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  it("a prévia conta o mesmo que o expurgo executa — e não escreve nada", async () => {
    const previa = await agent.get(`/api/lojas/${f.lojaId}/leads/expurgo/previa`).expect(200);
    expect(previa.body.aAnonimizar).toBe(2);

    // Read-only de verdade: depois do GET, nenhuma noiva mudou.
    const linhas = await db.select().from(leadsTable).where(inArray(leadsTable.id, antigas));
    expect(linhas.every((l) => l.noivaNome !== "(anonimizada)" && l.anonimizadaEm === null)).toBe(true);

    // A contagem da prévia é a contagem do expurgo, na MESMA fixture.
    const expurgo = await agent.post(`/api/lojas/${f.lojaId}/leads/expurgo`).send({}).expect(200);
    expect(expurgo.body.anonimizadas).toBe(previa.body.aAnonimizar);

    // E depois do expurgo, a prévia responde zero — nada para anonimizar.
    const depois = await agent.get(`/api/lojas/${f.lojaId}/leads/expurgo/previa`).expect(200);
    expect(depois.body.aAnonimizar).toBe(0);
  });

  it("a janela viaja com a prévia — mesesInatividade aperta o corte como no expurgo", async () => {
    // Com 6 meses de janela a perdida RECENTE (hoje) continua fora; as duas
    // antigas já foram anonimizadas pelo teste anterior.
    const r = await agent
      .get(`/api/lojas/${f.lojaId}/leads/expurgo/previa?mesesInatividade=6`)
      .expect(200);
    expect(r.body.aAnonimizar).toBe(0);
  });
});
