import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogTable, contratosTable, db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-O4/R6 — **"todos os bloqueios vinculados" não era todo mundo.**
 *
 * `PATCH /reservas/:id` declara a doutrina em comentário — *"reserva é a fonte
 * da verdade da data operacional → propaga a nova data a todos os bloqueios
 * vinculados"* — e parava no bloqueio. O contrato ATIVO preso àquelas peças
 * guarda a própria `dataCasamento`, e é ELA que o PDF assinado
 * (`lib/contrato-pdf.ts`) e o portal da noiva (`portal.ts:259`) mostram.
 *
 * **Vermelho medido em 2026-08-12**, com o vínculo N:N de verdade
 * (`bloqueioVestidoIds`, não `bloqueioIds` — o primeiro nome que tentei era
 * ignorado pelo zod e o contrato nascia sem vínculo nenhum, o que teria dado um
 * verde falso):
 *
 * ```
 * PATCH /reservas (data nova): 200
 * reserva.casamentoData      : 2028-04-02
 * contrato.dataCasamento     : 2028-03-13   ← 20 dias para trás, em silêncio
 * ```
 *
 * **E uma correção ao diagnóstico da sobra.** Ela dizia que as duas portas
 * mandavam a pessoa para a outra: o `PATCH /contratos` responderia *"mude a
 * reserva primeiro"* sobre uma reserva que já mudou. **Não responde** — medido,
 * ele dá **200**. A guarda dele confere a data contra o BLOQUEIO
 * (`contratos.ts:1017-1027`), e o bloqueio se moveu junto com a reserva. Não há
 * beco; há divergência calada, que é pior — ninguém vai procurar.
 */
describe("S-O4 — a data do contrato segue a reserva", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function vendaComContrato(diasCasamento: number) {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const data = dataFutura(diasCasamento);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: data });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: data,
    });
    const contrato = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        dataCasamento: data.toISOString(),
        bloqueioVestidoIds: [bloqueio.id],
      })
      .expect(201);
    return { agent, lead, reserva, bloqueio, contrato, data };
  }

  const diaDo = (d: Date | string | null | undefined) =>
    d ? new Date(d).toISOString().slice(0, 10) : null;

  it("mover a data da reserva move a do contrato ATIVO — o PDF e o portal acompanham", async () => {
    const { agent, reserva, contrato } = await vendaComContrato(180);
    const dataNova = dataFutura(200);

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: dataNova.toISOString() })
      .expect(200);

    const [c] = await db.select().from(contratosTable).where(eq(contratosTable.id, contrato.body.id));
    expect(diaDo(c?.dataCasamento)).toBe(diaDo(dataNova));
  });

  it("e deixa trilha, porque o papel que a noiva assinou passou a dizer outra data", async () => {
    const { agent, reserva, contrato, data } = await vendaComContrato(300);
    const dataNova = dataFutura(320);

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: dataNova.toISOString() })
      .expect(200);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entidadeId, reserva.id),
          eq(auditLogTable.acao, "CONTRATO_DATA_SEGUIU_RESERVA"),
        ),
      )
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(1);

    const detalhe = linha?.detalhe as Record<string, unknown> | undefined;
    expect(detalhe, "a mudança do papel assinado tem de deixar rastro").toBeDefined();
    expect(diaDo(detalhe?.de as string)).toBe(diaDo(data));
    expect(diaDo(detalhe?.para as string)).toBe(diaDo(dataNova));
    expect(detalhe?.contratos).toEqual([contrato.body.id]);
  });

  it("contrato CANCELADO não se reescreve — é história, e história assinada", async () => {
    const { agent, reserva, contrato } = await vendaComContrato(240);
    const [antes] = await db
      .select()
      .from(contratosTable)
      .where(eq(contratosTable.id, contrato.body.id));

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.body.id}/cancelar`)
      .send({ motivo: "Noiva desistiu" })
      .expect(200);

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: dataFutura(260).toISOString() })
      .expect(200);

    const [depois] = await db
      .select()
      .from(contratosTable)
      .where(eq(contratosTable.id, contrato.body.id));
    expect(
      diaDo(depois?.dataCasamento),
      "reescrever a data de um contrato encerrado falsificaria o que foi assinado",
    ).toBe(diaDo(antes?.dataCasamento));
  });

  it("reserva sem contrato nenhum não gera trilha — silêncio é o normal", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const data = dataFutura(400);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: data });
    await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: data,
    });

    await agent
      .patch(`/api/lojas/${f.lojaId}/reservas/${reserva.id}`)
      .send({ casamentoData: dataFutura(420).toISOString() })
      .expect(200);

    const linhas = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entidadeId, reserva.id),
          eq(auditLogTable.acao, "CONTRATO_DATA_SEGUIU_RESERVA"),
        ),
      );
    expect(linhas).toHaveLength(0);
  });
});
