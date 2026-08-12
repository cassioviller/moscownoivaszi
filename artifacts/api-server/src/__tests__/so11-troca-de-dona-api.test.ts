import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogTable, bloqueioVestidosTable, db } from "@workspace/db";
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
 * S-O11 — **a reserva aberta na noiva ERRADA passa a ter conserto.**
 *
 * A adoção do E162 (A02.4) só alcança a reserva SEM dona: ela entra nas
 * candidatas do contrato e é adotada no fechamento. Quem escolheu a noiva
 * errada no combobox ficava com a peça presa no nome de outra — e o único
 * caminho era apagar a reserva, que o E115 **recusa** quando ela carrega prova,
 * avaria ou contrato ativo. Era a metade do A02.4 que não entrou.
 *
 * Vermelho medido em 2026-08-12: `BloqueioVestidoUpdate` não tinha `leadId`, e
 * o campo era descartado pelo zod antes de chegar à rota — o PATCH respondia
 * **200 sem mudar nada**, que é a pior forma de recusar.
 */
describe("S-O11 — trocar a noiva de uma reserva", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await criarFixture();
  });

  afterAll(async () => {
    await limparFixture(f);
    await fecharPool();
  });

  async function reservaDe(leadId: string, dias: number) {
    const vestido = await criarVestido(f);
    const data = dataFutura(dias);
    return criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: data,
    });
  }

  it("a peça reservada na noiva errada passa para a certa, e deixa rastro", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const errada = await criarLead(f, { noivaNome: "A Que Não É" });
    const certa = await criarLead(f, { noivaNome: "A Noiva Certa" });
    const bloqueio = await reservaDe(errada.id, 180);

    await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ leadId: certa.id })
      .expect(200);

    const [b] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(b?.leadId).toBe(certa.id);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, bloqueio.id), eq(auditLogTable.acao, "RESERVA_DONA_TROCADA")))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(1);
    const detalhe = linha?.detalhe as Record<string, unknown> | undefined;
    expect(detalhe?.de, "o `de` não existe em lugar nenhum depois da escrita").toBe(errada.id);
    expect(detalhe?.para).toBe(certa.id);
  });

  it("`null` devolve a reserva a SEM DONA — o estado que a adoção do E162 resolve", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const bloqueio = await reservaDe(lead.id, 190);

    await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ leadId: null })
      .expect(200);

    const [b] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(b?.leadId).toBeNull();
  });

  it("PATCH sem `leadId` não mexe na dona — ausente é 'não mexa'", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const lead = await criarLead(f);
    const bloqueio = await reservaDe(lead.id, 200);

    await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ observacao: "só uma anotação" })
      .expect(200);

    const [b] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(b?.leadId).toBe(lead.id);

    const linhas = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, bloqueio.id), eq(auditLogTable.acao, "RESERVA_DONA_TROCADA")));
    expect(linhas, "escrever o mesmo valor não é trocar de dona").toHaveLength(0);
  });

  it("noiva de OUTRA loja é recusada — o vazamento de tenant pela porta nova", async () => {
    const outraLoja = await criarFixture();
    try {
      const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
      const lead = await criarLead(f);
      const daOutra = await criarLead(outraLoja);
      const bloqueio = await reservaDe(lead.id, 210);

      const r = await agent
        .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
        .send({ leadId: daOutra.id })
        .expect(422);
      expect(r.body.error).toBe("REFERENCIA_INVALIDA");
    } finally {
      await limparFixture(outraLoja);
    }
  });

  it("com contrato ATIVO preso, recusa — o nome dela já está no papel assinado", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const dona = await criarLead(f);
    const outra = await criarLead(f);
    const vestido = await criarVestido(f);
    const data = dataFutura(220);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: dona.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: data,
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: dona.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 5000,
        dataCasamento: data.toISOString(),
        bloqueioVestidoIds: [bloqueio.id],
      })
      .expect(201);

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ leadId: outra.id })
      .expect(409);
    expect(r.body.error).toBe("RESERVA_COM_CONTRATO");
    expect(r.body.detalhe, "a frase diz o caminho, não só o não").toMatch(/cancele o contrato/i);

    const [b] = await db
      .select()
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));
    expect(b?.leadId, "a recusa não pode ter escrito nada").toBe(dona.id);
  });

  it("pendurado na reserva-mãe de outra noiva, recusa — as duas pontas não podem discordar", async () => {
    const agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    const daMae = await criarLead(f, { noivaNome: "Dona da Reserva-Mãe" });
    const outra = await criarLead(f);
    const vestido = await criarVestido(f);
    const data = dataFutura(240);
    const mae = await criarReserva(f, { leadId: daMae.id, casamentoData: data });
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      leadId: daMae.id,
      reservaId: mae.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: data,
    });

    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}`)
      .send({ leadId: outra.id })
      .expect(422);
    expect(r.body.error).toBe("RESERVA_MAE_DE_OUTRA_NOIVA");
  });
});
