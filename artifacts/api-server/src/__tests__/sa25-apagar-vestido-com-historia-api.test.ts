import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, vestidosTable, bloqueioVestidosTable, avariasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-A25 — o que tem história não se apaga, e a peça do acervo não era exceção.
 *
 * `DELETE /lojas/:lojaId/vestidos/:vestidoId` eram cinco linhas sem guarda
 * alguma: `db.delete(...)` e 204. A cascata do banco faz o resto, e ela é mais
 * funda do que a rota deixa ver — `bloqueio_vestidos.vestido_id` é CASCADE, e
 * dele descem `atendimentos` (a prova marcada da noiva), `avarias` (o reparo
 * COBRADO) e `contrato_bloqueios`.
 *
 * Medido no banco de dev antes do conserto: 334 peças com bloqueio, 14
 * atendimentos e 124 avarias pendurados neles — **R$ 43.400,00 em reparos que
 * sumiriam junto com as peças**, sem uma linha de aviso.
 *
 * A assimetria que motivou a sobra: a migração de faxina da S-A13, escrita no
 * mesmo dia, tinha guarda explícita contra exatamente isto (`AND NOT EXISTS …
 * contrato_itens`) — o SQL de limpeza era mais cuidadoso com o acervo do que a
 * rota que a loja usa todo dia.
 */
describe("S-A25 — apagar peça com história é recusado, e a resposta diz quem depende", () => {
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

  it("peça sem história nenhuma continua sendo apagável — a guarda não travou o acervo", async () => {
    const vestido = await criarVestido(f);

    await agent.delete(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}`).expect(204);

    const sobrou = await db.select().from(vestidosTable).where(eq(vestidosTable.id, vestido.id));
    expect(sobrou).toHaveLength(0);
  });

  it("peça com reserva é recusada com 409, e a reserva sobrevive", async () => {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: new Date(Date.now() + 90 * 86_400_000),
    });

    const r = await agent.delete(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}`).expect(409);
    expect(r.body.error).toBe("VESTIDO_COM_HISTORIA");
    expect(r.body.detalhe).toContain("1 reserva(s)");

    // O que a cascata teria levado continua lá — é o ponto inteiro da sobra.
    expect(await db.select().from(vestidosTable).where(eq(vestidosTable.id, vestido.id))).toHaveLength(1);
    expect(
      await db.select().from(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.id, bloqueio.id)),
    ).toHaveLength(1);
  });

  it("a avaria COBRADA desce do bloqueio, e é contada — R$ 350,00 não somem em silêncio", async () => {
    const vestido = await criarVestido(f);
    const lead = await criarLead(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: new Date(Date.now() + 120 * 86_400_000),
    });
    const avariaId = randomUUID();
    await db.insert(avariasTable).values({
      id: avariaId,
      lojaId: f.lojaId,
      bloqueioId: bloqueio.id,
      descricao: "Barra rasgada na prova",
      custoReparo: 350,
    });

    const r = await agent.delete(`/api/lojas/${f.lojaId}/vestidos/${vestido.id}`).expect(409);
    // A avaria não referencia o vestido: ela desce do bloqueio. Quem lesse só a
    // rota não saberia que ela estava em jogo.
    expect(r.body.detalhe).toContain("1 avaria(s)");
    expect(await db.select().from(avariasTable).where(eq(avariasTable.id, avariaId))).toHaveLength(1);
  });

  it("peça de outra loja responde 404, e não some por engano", async () => {
    const outra = await criarFixture();
    const vestidoAlheio = await criarVestido(outra);

    const r = await agent.delete(`/api/lojas/${f.lojaId}/vestidos/${vestidoAlheio.id}`).expect(404);
    expect(r.body.error).toBe("VESTIDO_NAO_ENCONTRADO");

    expect(
      await db.select().from(vestidosTable).where(eq(vestidosTable.id, vestidoAlheio.id)),
    ).toHaveLength(1);
    await limparFixture(outra);
  });
});
