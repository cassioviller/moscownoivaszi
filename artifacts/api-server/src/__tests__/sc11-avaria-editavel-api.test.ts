import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogTable,
  avariasTable,
  contratoItensTable,
  contratosTable,
  db,
  parcelasTable,
  perfisTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  criarBloqueio,
  criarContrato,
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
 * **S-C11 — a avaria não tinha porta de EDIÇÃO.**
 *
 * `descricao`, `tipo`, `custo_reparo` e `justificativa_da_taxa` só entravam no
 * `POST` de nascimento. Quem digitou **R$ 1.500,00** onde eram **R$ 150,00** só
 * tinha o caminho de apagar e refazer — e o E115 RECUSA apagar quando a avaria
 * sustenta cobrança viva (`AVARIA_COM_COBRANCA`), além de a foto-prova sair
 * junto com a linha. O erro de digitação mais barato do sistema não tinha
 * conserto, e o de dez vezes o valor é justamente o que a mão comete.
 *
 * Este arquivo prega o que a porta nova aceita, o que recusa e o que grava. As
 * três decisões que ela declara:
 *
 * 1. **A régua do E214 vale na edição inteira, não só no nascimento.** Corrigir
 *    para um número fora da faixa das cláusulas 14ª/15ª pede a razão escrita, e
 *    a razão vai para a trilha com os números — se não valesse, a edição seria
 *    a porta dos fundos da régua que o E214 pôs na frente.
 * 2. **A cobrança VIVA segue o número.** `parcelas.valor_previsto` nasceu de
 *    `avarias.custo_reparo`; deixar os dois divergirem é dois números para uma
 *    decisão só (E186) — a ficha diria R$ 150,00 e o carnê cobraria R$ 1.500,00.
 * 3. **Dinheiro que ENTROU congela a linha.** Com recebimento na parcela, o
 *    PATCH responde 409: o extrato, o fluxo e o DRE já contaram aquele real, e
 *    reescrever o número por baixo deles é reescrever o passado. O caminho de
 *    volta existe e é o de sempre — estornar a parcela, e então corrigir.
 */
describe("S-C11 — a avaria se corrige, e a correção deixa rastro", () => {
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

  /** A noiva, a peça e o contrato ATIVO que a vendeu — o mesmo arranjo do E214. */
  async function noivaComPecaContratada(aluguelDaPeca: number | null) {
    const casamento = dataFutura(40);
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      casamentoData: casamento,
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: aluguelDaPeca ?? 1000,
      fechadoEm: new Date(),
    });
    if (aluguelDaPeca !== null) {
      await db.insert(contratoItensTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        descricao: "Vestido de noiva",
        valorUnitario: aluguelDaPeca,
        quantidade: 1,
      });
    }
    return { lead, vestido, bloqueio, contrato };
  }

  const registrar = (bloqueioId: string, corpo: Record<string, unknown>) =>
    agent.post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`).send(corpo);

  const editar = (avariaId: string, corpo: Record<string, unknown>) =>
    agent.patch(`/api/lojas/${f.lojaId}/avarias/${avariaId}`).send(corpo);

  const cobrar = (avariaId: string, contratoId: string) =>
    agent.post(`/api/lojas/${f.lojaId}/avarias/${avariaId}/cobrar`).send({ contratoId });

  // ─────────────────── o gesto que faltava ───────────────────

  it("o zero a mais tem conserto: R$ 1.500,00 viram R$ 150,00 sem apagar a prova", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Rasgo na barra",
      tipo: "DANO",
      custoReparo: 1500,
    });
    expect(criada.status).toBe(201);

    const res = await editar(criada.body.id, { custoReparo: 150 });
    expect(res.status, "a porta de edição não existe — só dá para apagar e refazer").toBe(200);
    expect(res.body.custoReparo).toBe(150);

    const [linha] = await db.select().from(avariasTable).where(eq(avariasTable.id, criada.body.id));
    expect(linha!.custoReparo).toBe(150);
    // A descrição não foi tocada: campo ausente é "não mexi" (S-M10).
    expect(linha!.descricao).toBe("Rasgo na barra");
  });

  it("a descrição e o tipo também se corrigem, e o tipo TROCA a régua junto", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    // Nasce DANO de R$ 400,00 — a 15ª a aceita (teto R$ 15.000,00).
    const criada = await registrar(bloqueio.id, {
      descricao: "Mancha escura",
      tipo: "DANO",
      custoReparo: 400,
    });
    expect(criada.status).toBe(201);

    // Reclassificada como LIMPEZA, os mesmos R$ 400,00 continuam cabendo (14ª:
    // 350 a 2.500), e a descrição acompanha.
    const res = await editar(criada.body.id, { tipo: "LIMPEZA", descricao: "Mancha de vinho na saia" });
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe("LIMPEZA");
    expect(res.body.descricao).toBe("Mancha de vinho na saia");
  });

  // ─────────────────── a régua do E214 vale na edição ───────────────────

  it("editar para fora da faixa da 14ª é recusado, e o 422 diz a faixa", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Barra com terra",
      tipo: "LIMPEZA",
      custoReparo: 400,
    });
    expect(criada.status).toBe(201);

    const res = await editar(criada.body.id, { custoReparo: 50 });
    expect(res.status, "a edição seria a porta dos fundos da régua do E214").toBe(422);
    expect(res.body.error).toBe("TAXA_FORA_DA_FAIXA");
    expect(res.body.detalhe).toContain("350,00");
    expect(res.body.detalhe).toContain("2.500,00");
    expect(res.body.campos?.[0]?.campo).toBe("justificativaDaTaxa");

    // E a linha não mudou — 422 é antes de qualquer escrita.
    const [linha] = await db.select().from(avariasTable).where(eq(avariasTable.id, criada.body.id));
    expect(linha!.custoReparo).toBe(400);
  });

  it("o teto do dano continua sendo 5× o aluguel DAQUELA peça, também na edição", async () => {
    const { bloqueio } = await noivaComPecaContratada(400); // teto R$ 2.000,00
    const criada = await registrar(bloqueio.id, {
      descricao: "Véu rasgado",
      tipo: "DANO",
      custoReparo: 300,
    });
    expect(criada.status).toBe(201);

    const res = await editar(criada.body.id, { custoReparo: 2000.01 });
    expect(res.status).toBe(422);
    expect(res.body.detalhe).toContain("2.000,00");
  });

  it("com a razão escrita a correção entra, e a TRILHA guarda os números", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Esmalte no punho",
      tipo: "LIMPEZA",
      custoReparo: 900,
    });
    expect(criada.status).toBe(201);
    expect(criada.body.justificativaDaTaxa).toBeNull();

    const res = await editar(criada.body.id, {
      custoReparo: 120,
      justificativaDaTaxa: "A lavanderia cobrou R$ 120,00; a dona autorizou o valor real.",
    });
    expect(res.status).toBe(200);
    expect(res.body.justificativaDaTaxa).toContain("a dona autorizou");

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "AVARIA_FORA_DA_FAIXA"),
        eq(auditLogTable.entidadeId, criada.body.id),
      ))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(1);
    expect(trilha, "a taxa fora da faixa foi editada sem deixar rastro").toBeTruthy();
    expect(trilha!.detalhe).toMatchObject({
      momento: "EDICAO",
      clausula: "14ª",
      valor: 120,
      piso: 350,
      motivo: "ABAIXO_DO_PISO",
    });
  });

  it("corrigido para DENTRO da faixa, o selo vermelho SAI — a justificativa não vira permanente", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Mancha de tinta",
      tipo: "LIMPEZA",
      custoReparo: 120,
      justificativaDaTaxa: "Mancha pequena; a dona autorizou os R$ 120,00.",
    });
    expect(criada.status).toBe(201);
    expect(criada.body.justificativaDaTaxa).toContain("autorizou");

    // O número era um erro de digitação: eram R$ 1.200,00, que cabem na 14ª.
    const res = await editar(criada.body.id, { custoReparo: 1200 });
    expect(res.status).toBe(200);
    expect(
      res.body.justificativaDaTaxa,
      "a razão sobreviveu ao valor que ela explicava — a ficha mostraria selo vermelho sobre taxa que cabe",
    ).toBeNull();
  });

  // ─────────────────── toda edição deixa rastro ───────────────────

  it("toda edição deixa rastro, com o DE e o PARA de cada campo", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Puído na alça",
      tipo: "DANO",
      custoReparo: 1500,
    });
    expect(criada.status).toBe(201);

    expect((await editar(criada.body.id, { custoReparo: 150 })).status).toBe(200);

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "AVARIA_EDITADA"),
        eq(auditLogTable.entidadeId, criada.body.id),
      ));
    expect(trilha, "editar dinheiro sem rastro é o que o E115 fechou no DELETE").toBeTruthy();
    expect(trilha!.detalhe).toMatchObject({
      de: { custoReparo: 1500 },
      para: { custoReparo: 150 },
    });
  });

  // ─────────────────── a cobrança viva segue o número ───────────────────

  it("corrigir o valor de uma cobrança VIVA arrasta a parcela — um número, não dois", async () => {
    const { bloqueio, contrato } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Rasgo no decote",
      tipo: "DANO",
      custoReparo: 1500,
    });
    expect(criada.status).toBe(201);
    const cobrada = await cobrar(criada.body.id, contrato.id);
    expect(cobrada.status).toBe(201);
    const parcelaId = cobrada.body.parcelaId as string;

    const res = await editar(criada.body.id, { custoReparo: 150 });
    expect(res.status).toBe(200);

    const [parcela] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
    expect(
      parcela!.valorPrevisto,
      "a ficha diz R$ 150,00 e o carnê cobra R$ 1.500,00 — dois números para uma decisão só",
    ).toBe(150);

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "AVARIA_EDITADA"),
        eq(auditLogTable.entidadeId, criada.body.id),
      ));
    expect(trilha!.detalhe).toMatchObject({ parcelaSeguiu: parcelaId });
  });

  it("a cobrança viva confere o teto do contrato que a cobra, não o derivado", async () => {
    const { vestido, bloqueio, contrato } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Cauda destruída",
      tipo: "DANO",
      custoReparo: 1000,
    });
    expect(criada.status).toBe(201);
    expect((await cobrar(criada.body.id, contrato.id)).status).toBe(201);

    // O item do contrato encolhe: o teto passa a R$ 2.500,00.
    await db
      .update(contratoItensTable)
      .set({ valorUnitario: 500 })
      .where(and(
        eq(contratoItensTable.contratoId, contrato.id),
        eq(contratoItensTable.vestidoId, vestido.id),
      ));

    const res = await editar(criada.body.id, { custoReparo: 9000 });
    expect(res.status).toBe(422);
    expect(res.body.detalhe).toContain("2.500,00");
  });

  it("a cobrança CANCELADA não prende a linha — a mesma régua do DELETE do E115", async () => {
    const { bloqueio, contrato } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Queimadura",
      tipo: "DANO",
      custoReparo: 800,
    });
    expect(criada.status).toBe(201);
    const cobrada = await cobrar(criada.body.id, contrato.id);
    expect(cobrada.status).toBe(201);
    const parcelaId = cobrada.body.parcelaId as string;

    // O contrato cai, e a parcela do reparo cai junto: não há mais cobrança que
    // o número sustente.
    await db.update(parcelasTable).set({ status: "CANCELADA" }).where(eq(parcelasTable.id, parcelaId));

    const res = await editar(criada.body.id, { custoReparo: 80 });
    expect(res.status).toBe(200);
    const [parcela] = await db.select().from(parcelasTable).where(eq(parcelasTable.id, parcelaId));
    expect(parcela!.valorPrevisto, "a parcela morta não é reescrita — ela é história").toBe(800);
  });

  // ─────────────────── o dinheiro que entrou congela a linha ───────────────────

  it("avaria cuja cobrança já RECEBEU dinheiro não se edita — 409 que ensina o caminho", async () => {
    const { bloqueio, contrato } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Rasgo na cauda",
      tipo: "DANO",
      custoReparo: 1500,
    });
    expect(criada.status).toBe(201);
    const cobrada = await cobrar(criada.body.id, contrato.id);
    expect(cobrada.status).toBe(201);

    // A noiva pagou R$ 500,00 do reparo: o extrato, o fluxo e o DRE já contaram
    // esse real no dia em que ele entrou.
    await db
      .update(parcelasTable)
      .set({ status: "PARCIAL", valorRecebido: 500, recebidoEm: new Date() })
      .where(eq(parcelasTable.id, cobrada.body.parcelaId));

    const res = await editar(criada.body.id, { custoReparo: 150 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("AVARIA_COM_RECEBIMENTO");
    expect(res.body.detalhe).toContain("estorne");

    const [linha] = await db.select().from(avariasTable).where(eq(avariasTable.id, criada.body.id));
    expect(linha!.custoReparo).toBe(1500);
  });

  it("apagar o custo de uma cobrança viva é recusado — a parcela ficaria sem número", async () => {
    const { bloqueio, contrato } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Mancha na cauda",
      tipo: "DANO",
      custoReparo: 900,
    });
    expect(criada.status).toBe(201);
    expect((await cobrar(criada.body.id, contrato.id)).status).toBe(201);

    const res = await editar(criada.body.id, { custoReparo: null });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("AVARIA_SEM_CUSTO");
  });

  it("sem cobrança, `null` devolve a avaria a `não avaliado` — a régua do S-M10", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Ver com a costureira",
      tipo: "DANO",
      custoReparo: 300,
    });
    expect(criada.status).toBe(201);

    const res = await editar(criada.body.id, { custoReparo: null });
    expect(res.status).toBe(200);
    expect(res.body.custoReparo).toBeNull();
  });

  // ─────────────────── a fronteira ───────────────────

  it("avaria de outra loja responde 404, e nada é escrito", async () => {
    const outra = await criarFixture();
    try {
      const casamento = dataFutura(40);
      const lead = await criarLead(outra);
      const vestido = await criarVestido(outra);
      const reserva = await criarReserva(outra, { leadId: lead.id, casamentoData: casamento });
      const bloqueio = await criarBloqueio(outra, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: casamento,
      });
      const [alheia] = await db
        .insert(avariasTable)
        .values({
          id: randomUUID(),
          lojaId: outra.lojaId,
          bloqueioId: bloqueio.id,
          descricao: "Rasgo de outra loja",
          tipo: "DANO",
          custoReparo: 500,
        })
        .returning();

      const res = await editar(alheia!.id, { custoReparo: 100 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("AVARIA_NAO_ENCONTRADA");

      const [linha] = await db.select().from(avariasTable).where(eq(avariasTable.id, alheia!.id));
      expect(linha!.custoReparo).toBe(500);
    } finally {
      await limparFixture(outra);
    }
  });

  it("a peça fora de contrato entra, e a trilha diz que não conferiu — como no nascimento", async () => {
    const { bloqueio } = await noivaComPecaContratada(null);
    const criada = await registrar(bloqueio.id, {
      descricao: "Rasgo na cauda",
      tipo: "DANO",
      custoReparo: 500,
    });
    expect(criada.status).toBe(201);

    const res = await editar(criada.body.id, { custoReparo: 4000 });
    expect(res.status).toBe(200);

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "AVARIA_FORA_DA_FAIXA"),
        eq(auditLogTable.entidadeId, criada.body.id),
      ))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(1);
    expect(trilha!.detalhe).toMatchObject({
      momento: "EDICAO",
      motivo: "TETO_INDETERMINADO",
      conferida: false,
      valor: 4000,
    });
  });

  /**
   * O gate é o do PREFIXO (`reservas.ts:1376`, `requireModulo("vestidos")`),
   * que deriva a ação do método. Escrevi um `requireModulo` explícito na rota
   * antes de medir, por ter lido só o topo do arquivo — e o que a medição diz é
   * que a permissão já estava guardada. Este teste é o que sobra da leitura
   * errada, e vale mais que o middleware que ele substituiu: **quem apagar a
   * linha `:1376` reprova aqui**, e a porta que mexe em dinheiro não fica
   * aberta em silêncio. Ele roda por ÚLTIMO porque mexe no perfil da fixture.
   */
  it("o contrato CANCELADO não dá teto — a mesma régua do nascimento", async () => {
    // A avaria que nasceu sob um contrato ativo continua editável depois de ele
    // cair: o teto passa a ser indeterminado, e a régua diz que não conferiu.
    const { bloqueio, contrato } = await noivaComPecaContratada(400);
    const criada = await registrar(bloqueio.id, {
      descricao: "Véu manchado",
      tipo: "DANO",
      custoReparo: 300,
    });
    expect(criada.status).toBe(201);
    await db
      .update(contratosTable)
      .set({ status: "CANCELADO", canceladoEm: new Date() })
      .where(eq(contratosTable.id, contrato.id));

    const res = await editar(criada.body.id, { custoReparo: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.custoReparo).toBe(5000);
  });

  it("quem não pode EDITAR vestidos não corrige avaria — 403 nas duas faltas", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Puído",
      tipo: "DANO",
      custoReparo: 500,
    });
    expect(criada.status).toBe(201);

    // Só VER: a vendedora enxerga a avaria e não a corrige.
    await db
      .update(perfisTable)
      .set({ acessosModulos: { vestidos: { ver: true, criar: false, editar: false } } })
      .where(eq(perfisTable.id, f.perfilId));
    expect((await editar(criada.body.id, { custoReparo: 1 })).status).toBe(403);

    // Sem `vestidos` nenhum.
    await db
      .update(perfisTable)
      .set({ acessosModulos: { leads: { ver: true, criar: true, editar: true } } })
      .where(eq(perfisTable.id, f.perfilId));
    expect((await editar(criada.body.id, { custoReparo: 1 })).status).toBe(403);

    const [linha] = await db.select().from(avariasTable).where(eq(avariasTable.id, criada.body.id));
    expect(linha!.custoReparo, "o 403 escreveu").toBe(500);
  });
});
