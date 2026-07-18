import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  db,
  atendimentosTable,
  bloqueioVestidosTable,
  cabinesTable,
  usuariosTable,
  usuariosLojasTable,
} from "@workspace/db";
import { hashSenha } from "../lib/auth";
import {
  criarFixture,
  criarLead,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";

/**
 * Lote 17 — a rede anti-corrida do agendamento, provada sob concorrência real.
 *
 * A validação da rota é check-then-insert sem lock: dois requests simultâneos
 * passam o check juntos. Quem segura é o BANCO — unique(cabine, inicio),
 * unique(loja, vendedora, inicio) e o EXCLUDE gist de vestido×janela — e o
 * mapa 23505/23P01→409 do handler global. Até aqui só havia teste SEQUENCIAL
 * (lote 3); este arquivo dispara os dois requests de fato ao mesmo tempo, o
 * mesmo padrão que pegou C3/C4 na folha.
 */

// Meio-dia São Paulo, dias futuros fixos — como no lote 3.
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("Lote 17 — agendamento sob concorrência", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;
  let cabine1: string;
  let cabine2: string;
  let vendedora2: string;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.superAdminEmail, f.lojaId);

    cabine1 = randomUUID();
    cabine2 = randomUUID();
    await db.insert(cabinesTable).values([
      { id: cabine1, lojaId: f.lojaId, nome: "Cabine 1" },
      { id: cabine2, lojaId: f.lojaId, nome: "Cabine 2" },
    ]);

    // Segunda vendedora da MESMA loja: isola a unique de cabine da de vendedora.
    vendedora2 = randomUUID();
    const senhaHash = await hashSenha(SENHA_TESTE);
    await db.insert(usuariosTable).values({
      id: vendedora2,
      nome: "Vendedora Dois",
      email: `vendedora2-${vendedora2.slice(0, 8)}@teste.local`,
      senhaHash,
    });
    await db.insert(usuariosLojasTable).values({
      usuarioId: vendedora2,
      lojaId: f.lojaId,
      perfilId: f.perfilId,
    });
  });

  afterAll(async () => {
    await db.delete(usuariosTable).where(eq(usuariosTable.id, vendedora2));
    await limparFixture(f);
    await fecharPool();
  });

  it("mesma cabine + mesmo início sob corrida: [201, 409], um só no banco", async () => {
    const [leadA, leadB] = await Promise.all([criarLead(f), criarLead(f)]);
    const inicio = dia("2027-03-10").toISOString();

    // Vendedoras DIFERENTES: a única colisão possível é a unique da cabine.
    const [r1, r2] = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
        leadId: leadA.id, cabineId: cabine1, vendedoraId: f.vendedoraId, inicio,
      }),
      agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
        leadId: leadB.id, cabineId: cabine1, vendedoraId: vendedora2, inicio,
      }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const gravados = await db
      .select({ id: atendimentosTable.id })
      .from(atendimentosTable)
      .where(and(
        eq(atendimentosTable.cabineId, cabine1),
        eq(atendimentosTable.inicio, new Date(inicio)),
      ));
    expect(gravados).toHaveLength(1);
  });

  it("mesma vendedora + mesmo início em cabines diferentes: [201, 409], um só no banco", async () => {
    const [leadA, leadB] = await Promise.all([criarLead(f), criarLead(f)]);
    const inicio = dia("2027-03-11").toISOString();

    // Cabines DIFERENTES: a única colisão possível é a unique da vendedora.
    const [r1, r2] = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
        leadId: leadA.id, cabineId: cabine1, vendedoraId: f.vendedoraId, inicio,
      }),
      agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
        leadId: leadB.id, cabineId: cabine2, vendedoraId: f.vendedoraId, inicio,
      }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const gravados = await db
      .select({ id: atendimentosTable.id })
      .from(atendimentosTable)
      .where(and(
        eq(atendimentosTable.vendedoraId, f.vendedoraId),
        eq(atendimentosTable.inicio, new Date(inicio)),
      ));
    expect(gravados).toHaveLength(1);
  });

  it("mesmo vestido + janelas sobrepostas sob corrida: [201, 409], um bloqueio só", async () => {
    // O check da rota (verificarDisponibilidade) roda ANTES do insert, sem
    // transação: sob corrida os dois passam. Quem decide é o EXCLUDE gist de
    // vestido×daterange — o perdedor leva 23P01, que o handler traduz em 409
    // (sem a lista amigável de conflitos, mas nunca 500 e nunca duplicata).
    const vestido = await criarVestido(f);
    const [leadA, leadB] = await Promise.all([criarLead(f), criarLead(f)]);
    const casamento = dia("2027-09-18").toISOString();

    const [r1, r2] = await Promise.all([
      agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
        vestidoId: vestido.id, leadId: leadA.id, tipo: "RESERVA_CASAMENTO", casamentoData: casamento,
      }),
      agent.post(`/api/lojas/${f.lojaId}/bloqueios`).send({
        vestidoId: vestido.id, leadId: leadB.id, tipo: "RESERVA_CASAMENTO", casamentoData: casamento,
      }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const gravados = await db
      .select({ id: bloqueioVestidosTable.id })
      .from(bloqueioVestidosTable)
      .where(eq(bloqueioVestidosTable.vestidoId, vestido.id));
    expect(gravados).toHaveLength(1);
  });
});
