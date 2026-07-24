import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  atendimentosTable,
  cabinesTable,
  lojasTable,
  regraDisponibilidadeTable,
  usuariosTable,
  usuariosLojasTable,
} from "@workspace/db";
import { hashSenha } from "../lib/auth";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  SENHA_TESTE,
  type Fixture,
} from "./helpers";

/**
 * E28 — reagendar arrastando na grade passa pelo PATCH de atendimento, que até
 * aqui não validava NADA além do shape zod: nem escopo de tenant das FKs (o
 * POST já validava), nem expediente, nem choque de agenda.
 *
 * O que se prova: cada recusa tem código próprio (a grade precisa saber qual
 * célula apagar), a UNIQUE do banco continua sendo a guarda real sob corrida, e
 * mover para dentro do próprio lugar não é conflito consigo mesmo.
 */

const emSP = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);
const DIA = "2027-04-12";

describe("Agenda — mover atendimento (E28)", () => {
  let f: Fixture;
  let ag: Awaited<ReturnType<typeof loginComLoja>>;
  let cabine1: string;
  let cabine2: string;
  let vendedora2: string;
  let lojaVizinhaId: string;
  let cabineDaVizinha: string;

  beforeAll(async () => {
    f = await criarFixture();
    ag = await loginComLoja(f.superAdminEmail, f.lojaId);

    cabine1 = randomUUID();
    cabine2 = randomUUID();
    await db.insert(cabinesTable).values([
      { id: cabine1, lojaId: f.lojaId, nome: "Cabine 1" },
      { id: cabine2, lojaId: f.lojaId, nome: "Cabine 2" },
    ]);

    // Expediente explícito: a grade desenha 9h–19h e o PATCH recusa fora disso.
    await db.insert(regraDisponibilidadeTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      atendimentoAberturaHora: 9,
      atendimentoFechamentoHora: 19,
    });

    vendedora2 = randomUUID();
    const senhaHash = await hashSenha(SENHA_TESTE);
    await db.insert(usuariosTable).values({
      id: vendedora2,
      nome: "Vendedora Dois",
      email: `v2-${vendedora2.slice(0, 8)}@teste.local`,
      senhaHash,
    });
    await db.insert(usuariosLojasTable).values({
      usuarioId: vendedora2,
      lojaId: f.lojaId,
      perfilId: f.perfilId,
    });

    // Loja vizinha, para provar que o PATCH não aceita cabine de fora.
    lojaVizinhaId = randomUUID();
    cabineDaVizinha = randomUUID();
    await db.insert(lojasTable).values({ id: lojaVizinhaId, nome: `Loja Vizinha ${lojaVizinhaId.slice(0, 8)}` });
    await db.insert(cabinesTable).values({
      id: cabineDaVizinha,
      lojaId: lojaVizinhaId,
      nome: "Cabine da Vizinha",
    });
  });

  afterAll(async () => {
    await db.delete(lojasTable).where(eq(lojasTable.id, lojaVizinhaId));
    await db.delete(usuariosTable).where(eq(usuariosTable.id, vendedora2));
    await limparFixture(f);
    await fecharPool();
  });

  async function criarAtendimento(opcoes: {
    cabineId: string;
    hora: string;
    vendedoraId?: string;
  }): Promise<string> {
    const lead = await criarLead(f);
    const id = randomUUID();
    await db.insert(atendimentosTable).values({
      id,
      lojaId: f.lojaId,
      leadId: lead.id,
      cabineId: opcoes.cabineId,
      vendedoraId: opcoes.vendedoraId ?? f.superAdminId,
      inicio: emSP(DIA, opcoes.hora),
    });
    return id;
  }

  const mover = (id: string, corpo: Record<string, unknown>) =>
    ag.patch(`/api/lojas/${f.lojaId}/atendimentos/${id}`).send(corpo);

  it("move para célula livre", async () => {
    const id = await criarAtendimento({ cabineId: cabine1, hora: "10:00" });

    const res = await mover(id, { cabineId: cabine2, inicio: emSP(DIA, "15:00").toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.cabineId).toBe(cabine2);
    expect(new Date(res.body.inicio).toISOString()).toBe(emSP(DIA, "15:00").toISOString());
  });

  it("fora do expediente é 422 FORA_DO_HORARIO", async () => {
    const id = await criarAtendimento({ cabineId: cabine1, hora: "10:30" });

    const res = await mover(id, { inicio: emSP(DIA, "20:00").toISOString() });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("FORA_DO_HORARIO");
  });

  it("cabine já ocupada naquele instante é 422 CABINE_OCUPADA", async () => {
    const ocupante = await criarAtendimento({ cabineId: cabine2, hora: "11:00" });
    const id = await criarAtendimento({ cabineId: cabine1, hora: "11:30" });

    const res = await mover(id, { cabineId: cabine2, inicio: emSP(DIA, "11:00").toISOString() });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("CABINE_OCUPADA");
    // A mensagem diz o que colidiu — o 409 cru do banco não dizia.
    expect(res.body.detalhe).toContain("cabine");
    expect(ocupante).toBeTruthy();
  });

  it("a mesma vendedora em duas cabines ao mesmo tempo é 422 VENDEDORA_OCUPADA", async () => {
    await criarAtendimento({ cabineId: cabine1, hora: "12:00" });
    const id = await criarAtendimento({ cabineId: cabine2, hora: "12:30", vendedoraId: f.superAdminId });

    const res = await mover(id, { cabineId: cabine2, inicio: emSP(DIA, "12:00").toISOString() });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("VENDEDORA_OCUPADA");
  });

  it("soltar de volta no próprio lugar não é conflito consigo mesmo", async () => {
    const id = await criarAtendimento({ cabineId: cabine1, hora: "13:00" });

    const res = await mover(id, { cabineId: cabine1, inicio: emSP(DIA, "13:00").toISOString() });

    expect(res.status).toBe(200);
  });

  it("cabine de outra loja é recusada — não vaza tenant por FK forjada", async () => {
    const id = await criarAtendimento({ cabineId: cabine1, hora: "14:00" });

    const res = await mover(id, { cabineId: cabineDaVizinha });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("REFERENCIA_INVALIDA");

    // E não escreveu: a cabine continua sendo a desta loja.
    const [depois] = await db
      .select({ cabineId: atendimentosTable.cabineId })
      .from(atendimentosTable)
      .where(eq(atendimentosTable.id, id));
    expect(depois!.cabineId).toBe(cabine1);
  });

  it("editar só a observação não passa pela régua de movimento", async () => {
    // Um atendimento marcado fora do expediente (dado legado) precisa continuar
    // editável — a regra só vale para quem MOVE.
    const id = await criarAtendimento({ cabineId: cabine1, hora: "21:00" });

    const res = await mover(id, { observacao: "noiva avisou que atrasa" });

    expect(res.status).toBe(200);
    expect(res.body.observacao).toBe("noiva avisou que atrasa");
  });

  it("sob corrida, dois moves para a MESMA célula: um 200 e um recusado", async () => {
    // A pré-checagem é check-then-write, sem lock: os dois passam o SELECT
    // juntos. Quem segura é a UNIQUE — a mesma rede do lote17, agora no PATCH.
    const a = await criarAtendimento({ cabineId: cabine1, hora: "16:00" });
    const b = await criarAtendimento({ cabineId: cabine2, hora: "16:30", vendedoraId: vendedora2 });
    const alvo = emSP(DIA, "17:00").toISOString();

    const [r1, r2] = await Promise.all([
      mover(a, { cabineId: cabine1, inicio: alvo }),
      mover(b, { cabineId: cabine1, inicio: alvo }),
    ]);

    const status = [r1.status, r2.status].sort();
    expect(status[0]).toBe(200);
    expect([409, 422]).toContain(status[1]);

    const naCelula = await db
      .select({ id: atendimentosTable.id })
      .from(atendimentosTable)
      .where(eq(atendimentosTable.inicio, new Date(alvo)));
    expect(naCelula).toHaveLength(1);
  });
});
