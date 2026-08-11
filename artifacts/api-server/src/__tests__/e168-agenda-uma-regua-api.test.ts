import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db, atendimentosTable, regraDisponibilidadeTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  EXPEDIENTE_PADRAO,
  expedienteDaRegra,
  recusaDeMover,
  seguraOIntervalo,
} from "@workspace/agenda-core";
import { arquivosVersionados } from "./arquivos-versionados";
import {
  criarBloqueio,
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
 * E168 — a agenda diz a mesma coisa em todas as telas.
 *
 * A fatia 4 achou a régua de agendamento re-derivada em três lugares, com as
 * três divergindo. O E161 fechou o que corrompia DADO; este fecha o que faz
 * duas telas da mesma agenda afirmarem coisas opostas sobre o mesmo horário —
 * mais as duas perdas silenciosas do lado do servidor.
 *
 * Aqui vive o lado da API e do NÚCLEO: o montador único do expediente (G8), a
 * régua de `situacao` (G9), o movimento que derruba a confirmação (G10) e o
 * PUT de regras que aceitava a loja fechada o dia inteiro (G12).
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

describe("E168 — o núcleo da agenda, uma régua só", () => {
  // ─────────── G8 — o expediente nasce de UM montador ────────────────────────

  it("G8 · `expedienteDaRegra` carrega os QUATRO campos, e a loja sem regra cai no padrão", () => {
    const regra = {
      atendimentoAberturaHora: 10,
      atendimentoFechamentoHora: 19,
      diasFuncionamento: [1, 2, 3, 4, 5],
      provaDuracao: 3,
    };
    /**
     * VERMELHO ANTES: a montagem à mão de `agenda/index.tsx:108` devolvia
     * `{ aberturaHora, fechamentoHora, dias }` e **perdia `provaDuracao`** —
     * `expected undefined to be 3`. Toda prova virava 1 slot na grade do dia.
     */
    expect(expedienteDaRegra(regra)).toEqual({
      aberturaHora: 10,
      fechamentoHora: 19,
      dias: [1, 2, 3, 4, 5],
      provaDuracao: 3,
    });
    // A ironia medida do achado: a loja SEM regra sempre esteve certa.
    expect(expedienteDaRegra(null).provaDuracao).toBe(2);
    expect(expedienteDaRegra(undefined)).toEqual(EXPEDIENTE_PADRAO);
  });

  /**
   * G8 — a varredura que impede a QUINTA cópia (regra 26 do método).
   *
   * As três cópias à mão eram idênticas na intenção e diferentes no resultado.
   * Consolidar sem trava é adiar: quem escrever a próxima tela de agenda vai
   * montar o objeto de novo, e a única pergunta é qual campo ela vai esquecer.
   *
   * Lê o arquivo INTEIRO, nunca linha a linha (S-D7): o prettier separa o par
   * `aberturaHora:` do `regra.atendimentoAberturaHora` e a varredura por linha
   * some com o ofensor.
   */
  it("G8 · ninguém fora do agenda-core traduz `regra` em `Expediente` à mão", () => {
    const DONO = "lib/agenda-core/src/mover.ts";
    const fontes = arquivosVersionados(RAIZ, ["artifacts", "lib", "scripts", "e2e"]).filter(
      (r) => /\.tsx?$/.test(r) && !/\.test\.tsx?$/.test(r) && !r.includes("/generated/"),
    );
    // Piso de população: uma varredura que não lê nada passa por engano.
    expect(fontes.length).toBeGreaterThan(300);

    const semComentarios = (codigo: string) =>
      codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    const ofensores = fontes
      .filter((r) => r !== DONO)
      .filter((r) => {
        const codigo = semComentarios(readFileSync(join(RAIZ, r), "utf8"));
        return /aberturaHora\s*:\s*[^,\n]*atendimentoAberturaHora/.test(codigo);
      });
    /**
     * VERMELHO ANTES: `expected [ 'artifacts/api-server/src/routes/agenda.ts',
     * 'artifacts/moscow-noivas/src/pages/agenda/index.tsx',
     * 'artifacts/moscow-noivas/src/pages/atendimentos/novo.tsx' ] to deeply
     * equal []` — as três cópias, uma delas incompleta.
     */
    expect(ofensores).toEqual([]);
  });

  // ─────────── G9 — quem segura a cabine mora no núcleo ──────────────────────

  it("G9 · a prova CONCLUÍDA não segura o slot seguinte, e o instante exato continua preso", () => {
    const expediente = { ...EXPEDIENTE_PADRAO, provaDuracao: 2 };
    const provaConcluida = {
      id: "prova",
      cabineId: "cabine-1",
      vendedoraId: "vendedora-1",
      inicio: "2026-09-10T17:00:00.000Z", // 14:00 em São Paulo
      tipo: "PROVA" as const,
      situacao: "CONCLUIDO",
    };
    const nova = {
      id: "__nova__",
      cabineId: "cabine-1",
      vendedoraId: "vendedora-1",
      inicio: "2026-09-10T17:30:00.000Z", // 14:30 — dentro dos 60 min da prova
    };

    /**
     * VERMELHO ANTES: `expected 'CABINE_OCUPADA' to be null`. A régua de
     * `situacao` vivia só em `atendimentos/novo.tsx:317`, num filtro montado
     * ANTES da chamada — a grade do dia entregava o dia inteiro e apagava a
     * célula das 14:30 de uma prova que já tinha acabado.
     */
    expect(recusaDeMover(nova, nova, [provaConcluida], expediente)).toBe(null);

    // E o instante EXATO continua recusado — as duas UNIQUE de `atendimentos`
    // o recusariam de qualquer jeito, e a tela não pode oferecer o que o banco
    // não aceita.
    const mesmoInstante = { ...nova, inicio: provaConcluida.inicio };
    expect(recusaDeMover(mesmoInstante, mesmoInstante, [provaConcluida], expediente)).toBe(
      "CABINE_OCUPADA",
    );

    // FALTOU tem a mesma natureza: a noiva não veio, a cabine está livre.
    const faltou = { ...provaConcluida, situacao: "FALTOU" };
    expect(recusaDeMover(nova, nova, [faltou], expediente)).toBe(null);

    // AGENDADO e EM_ATENDIMENTO seguram; a marcação SEM `situacao` é tratada
    // como viva, para nenhum SELECT antigo mudar de resposta em silêncio.
    for (const viva of ["AGENDADO", "EM_ATENDIMENTO", undefined]) {
      expect(recusaDeMover(nova, nova, [{ ...provaConcluida, situacao: viva }], expediente)).toBe(
        "CABINE_OCUPADA",
      );
    }
    expect(seguraOIntervalo({ ...provaConcluida, situacao: "AGENDADO" })).toBe(true);
    expect(seguraOIntervalo(provaConcluida)).toBe(false);
  });
});

describe("E168 — a agenda pela porta da API", () => {
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

  let seqCabine = 0;
  async function criarCabine() {
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/cabines`)
      .send({ nome: `Cabine E168 ${seqCabine++} ${randomUUID().slice(0, 6)}` });
    expect(r.status).toBe(201);
    return r.body as { id: string };
  }

  /** Instante em São Paulo: `dataFutura(dias)` com a hora local trocada. */
  function emSP(dias: number, hora: number, minuto = 0): Date {
    const d = dataFutura(dias);
    d.setUTCHours(hora + 3, minuto, 0, 0); // hora SP = UTC−3
    return d;
  }

  async function reservaDaNoiva(leadId: string) {
    const vestido = await criarVestido(f);
    return await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(200),
      leadId,
    });
  }

  // ─────────── G9 — o servidor concorda com a tela de agendar ────────────────

  it("G9 · a prova concluída às 14:00 libera as 14:30 — a tela oferecia e o POST recusava", async () => {
    const lead = await criarLead(f);
    const outra = await criarLead(f);
    const cabine = await criarCabine();
    const reserva = await reservaDaNoiva(lead.id);

    // A prova de 60 min (EXPEDIENTE_PADRAO: provaDuracao 2) às 14:00.
    const prova = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      tipo: "PROVA",
      bloqueioId: reserva.id,
      inicio: emSP(40, 14).toISOString(),
    });
    expect(prova.status).toBe(201);

    // A noiva provou e foi embora.
    await db
      .update(atendimentosTable)
      .set({ situacao: "CONCLUIDO" })
      .where(eq(atendimentosTable.id, prova.body.id));

    /**
     * VERMELHO ANTES: `expected 422 to be 201`, com
     * `error: "CABINE_OCUPADA"`. `atendimentos/novo.tsx:317` tirava CONCLUIDO
     * e FALTOU das ocupadas e pintava as 14:30 como livre; o servidor buscava
     * concorrentes sem olhar situação e recusava o clique. Duas telas da mesma
     * agenda, o mesmo horário, respostas opostas.
     */
    const depois = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: outra.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      inicio: emSP(40, 14, 30).toISOString(),
    });
    expect(depois.status).toBe(201);

    // O instante exato segue recusado, e com a frase da recusa — não com o
    // 23505 cru que a UNIQUE (cabine_id, inicio) devolveria.
    const emCima = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: outra.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      inicio: emSP(40, 14).toISOString(),
    });
    expect(emCima.status).toBe(422);
    expect(emCima.body.error).toBe("CABINE_OCUPADA");
  });

  // ─────────── G10 — mover desfaz a confirmação ──────────────────────────────

  it("G10 · mover o horário zera confirmação, contato e pedido de remarcação", async () => {
    const lead = await criarLead(f);
    const cabine = await criarCabine();

    const criado = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      inicio: emSP(41, 14).toISOString(),
    });
    expect(criado.status).toBe(201);

    const agora = new Date();
    await db
      .update(atendimentosTable)
      .set({ confirmadoEm: agora, contatadoEm: agora, remarcacaoPedidaEm: agora })
      .where(eq(atendimentosTable.id, criado.body.id));

    /**
     * VERMELHO ANTES: `expected '2026-08-11T...' to be null`. A noiva
     * confirmava 14:00, a recepção arrastava para 17:00 e a tela seguia
     * contando "1 confirmou pelo portal" — sobre um horário que ela nunca
     * viu. Ela chegava às 14:00.
     */
    const movido = await agent
      .patch(`/api/lojas/${f.lojaId}/atendimentos/${criado.body.id}`)
      .send({ inicio: emSP(41, 17).toISOString() });
    expect(movido.status).toBe(200);

    const [depois] = await db
      .select()
      .from(atendimentosTable)
      .where(eq(atendimentosTable.id, criado.body.id));
    expect(depois!.confirmadoEm).toBe(null);
    expect(depois!.remarcacaoPedidaEm).toBe(null);
    // Volta à fila de "Falta procurar": a régua tira quem tem QUALQUER um dos
    // três, e zerar dois de três deixaria a linha invisível para sempre.
    expect(depois!.contatadoEm).toBe(null);
  });

  it("G10 · trocar só a cabine PRESERVA a confirmação — a noiva não foi enganada", async () => {
    const lead = await criarLead(f);
    const cabine = await criarCabine();
    const outraCabine = await criarCabine();

    const criado = await agent.post(`/api/lojas/${f.lojaId}/atendimentos`).send({
      leadId: lead.id,
      cabineId: cabine.id,
      vendedoraId: f.vendedoraId,
      inicio: emSP(42, 15).toISOString(),
    });
    expect(criado.status).toBe(201);
    await db
      .update(atendimentosTable)
      .set({ confirmadoEm: new Date() })
      .where(eq(atendimentosTable.id, criado.body.id));

    // A mensagem que a noiva recebeu (`msgConfirmacaoAtendimento`) carrega
    // tipo, início, nome e endereço da loja — a cabine não aparece nela.
    const movido = await agent
      .patch(`/api/lojas/${f.lojaId}/atendimentos/${criado.body.id}`)
      .send({ cabineId: outraCabine.id });
    expect(movido.status).toBe(200);

    const [depois] = await db
      .select()
      .from(atendimentosTable)
      .where(eq(atendimentosTable.id, criado.body.id));
    expect(depois!.confirmadoEm).not.toBe(null);
  });

  // ─────────── G12 — a regra que fechava a loja em silêncio ──────────────────

  it("G12 · abertura 9 e fechamento 5 é 422 — a loja não para de agendar em silêncio", async () => {
    /**
     * VERMELHO ANTES: `expected 200 to be 422`. A validação existia só no
     * formulário (`atendimentos/config.tsx:231`). Gravado o par invertido,
     * `slotsDoDia` devolve `[]` (o guarda de `agenda-core/slots.ts:54`), a
     * grade do dia nasce sem NENHUMA linha e o POST responde
     * FORA_DO_HORARIO para as 24 horas do dia — sem nenhuma tela dizer por quê.
     */
    const invertido = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoAberturaHora: 9, atendimentoFechamentoHora: 5 });
    expect(invertido.status).toBe(422);
    expect(invertido.body.error).toBe("HORARIO_INVALIDO");

    const foraDaFaixa = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoAberturaHora: 9, atendimentoFechamentoHora: 30 });
    expect(foraDaFaixa.status).toBe(422);
    expect(foraDaFaixa.body.error).toBe("HORARIO_INVALIDO");

    const semDia = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ diasFuncionamento: [] });
    expect(semDia.status).toBe(422);
    expect(semDia.body.error).toBe("SEM_DIA_DE_FUNCIONAMENTO");

    // Nada foi gravado: a loja continua sem regra, no EXPEDIENTE_PADRAO.
    const nenhuma = await db
      .select()
      .from(regraDisponibilidadeTable)
      .where(eq(regraDisponibilidadeTable.lojaId, f.lojaId));
    expect(nenhuma.length).toBe(0);

    // O par válido segue passando, e o parcial também: o upsert confere o
    // valor EFETIVO, não o corpo.
    const valido = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoAberturaHora: 9, atendimentoFechamentoHora: 20, diasFuncionamento: [1, 2, 3, 4, 5, 6] });
    expect(valido.status).toBe(200);
    const soFechamento = await agent
      .put(`/api/lojas/${f.lojaId}/disponibilidade/regras`)
      .send({ atendimentoFechamentoHora: 8 });
    expect(soFechamento.status).toBe(422);
  });
});
