import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogTable,
  avariasTable,
  contratoItensTable,
  contratosTable,
  db,
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
 * **E214 — a taxa de limpeza e a de dano ganham faixa** (contrato de locação,
 * cláusulas 14ª e 15ª).
 *
 * > **14ª** — devolvido com excesso de sujeira ou manchas: taxa **de R$ 350,00
 * > a R$ 2.500,00** para a limpeza, avaliada pelo grau de dificuldade no
 * > recebimento.
 * >
 * > **15ª** — qualquer DANO, ou mancha que não sai com lavagem: taxa definida
 * > na devolução conforme o tipo de dano, **não excedendo cinco vezes o valor do
 * > aluguel de cada peça danificada**.
 *
 * `avarias.custo_reparo` era campo LIVRE: sem piso, sem teto e sem dizer de qual
 * cláusula o número saía. R$ 50,00 e R$ 9.000,00 entravam iguais.
 *
 * A conta pura e as decisões de leitura estão em `financeiro-core/avaria.ts` e
 * na régua dela (`moscow-noivas/src/lib/financeiro/avaria.test.ts`). Este
 * arquivo prega o outro lado: **o que as duas PORTAS aceitam, o que recusam e o
 * que gravam.**
 */
describe("E214 — a taxa de avaria ganha faixa", () => {
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

  /**
   * Uma noiva, a peça dela e o contrato ATIVO que a vendeu — o arranjo em que a
   * 15ª tem teto, porque é o `contrato_itens.valor_unitario` que o dá.
   */
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

  // ─────────────────── Cláusula 14ª — a limpeza ───────────────────

  it("a limpeza abaixo dos R$ 350,00 é recusada, e o 422 diz a faixa", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const res = await registrar(bloqueio.id, {
      descricao: "Barra com terra",
      tipo: "LIMPEZA",
      custoReparo: 50,
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("TAXA_FORA_DA_FAIXA");
    // A frase é a MESMA que a tela mostra — ela sai de `explicacaoDaFaixa`.
    expect(res.body.detalhe).toContain("350,00");
    expect(res.body.detalhe).toContain("2.500,00");
    expect(res.body.campos?.[0]?.campo).toBe("justificativaDaTaxa");
  });

  it("a limpeza acima dos R$ 2.500,00 é recusada pelo mesmo motivo", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const res = await registrar(bloqueio.id, {
      descricao: "Vômito na saia inteira",
      tipo: "LIMPEZA",
      custoReparo: 2500.01,
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("TAXA_FORA_DA_FAIXA");
  });

  it("dentro da faixa entra sem justificativa nenhuma, e o tipo fica gravado", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const res = await registrar(bloqueio.id, {
      descricao: "Esmalte no punho",
      tipo: "LIMPEZA",
      custoReparo: 350,
    });
    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe("LIMPEZA");
    expect(res.body.justificativaDaTaxa).toBeNull();
  });

  // ─────────────────── Cláusula 15ª — o dano ───────────────────

  it("o teto do dano é 5× o aluguel DAQUELA peça — R$ 15.000,00 no vestido de R$ 3.000,00", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const dentro = await registrar(bloqueio.id, {
      descricao: "Rasgo no decote",
      tipo: "DANO",
      custoReparo: 15000,
    });
    expect(dentro.status).toBe(201);

    const fora = await registrar(bloqueio.id, {
      descricao: "Rasgo no decote e na cauda",
      tipo: "DANO",
      custoReparo: 15000.01,
    });
    expect(fora.status).toBe(422);
    expect(fora.body.detalhe).toContain("15.000,00");
  });

  it("o MESMO valor passa na peça cara e é recusado na barata — o teto acompanha a peça", async () => {
    // É a razão pela qual o teto não pode ser constante: R$ 9.000,00 cabem em
    // 5 × R$ 3.000,00 e não cabem em 5 × R$ 400,00 (o véu).
    const cara = await noivaComPecaContratada(3000);
    const barata = await noivaComPecaContratada(400);
    expect(
      (await registrar(cara.bloqueio.id, { descricao: "Queimadura", tipo: "DANO", custoReparo: 9000 })).status,
    ).toBe(201);
    const recusada = await registrar(barata.bloqueio.id, {
      descricao: "Queimadura",
      tipo: "DANO",
      custoReparo: 9000,
    });
    expect(recusada.status).toBe(422);
    expect(recusada.body.detalhe).toContain("2.000,00");
  });

  it("peça fora de contrato: a 15ª não alcança, então entra — e a TRILHA diz que não conferiu", async () => {
    // Sem `contrato_itens` para a peça não há aluguel, e a cláusula limita a
    // taxa a cinco vezes "o valor do aluguel": ela é SILENTE, não violada.
    // Barrar seria inventar regra que o papel não tem. O que impede isso de
    // virar silêncio é a linha de trilha.
    const { bloqueio } = await noivaComPecaContratada(null);
    const res = await registrar(bloqueio.id, {
      descricao: "Rasgo na cauda",
      tipo: "DANO",
      custoReparo: 4000,
    });
    expect(res.status).toBe(201);

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.lojaId, f.lojaId),
        eq(auditLogTable.acao, "AVARIA_FORA_DA_FAIXA"),
        eq(auditLogTable.entidadeId, res.body.id),
      ));
    expect(trilha, "o valor entrou sem teto conferido e sem deixar rastro").toBeTruthy();
    expect(trilha!.detalhe).toMatchObject({
      motivo: "TETO_INDETERMINADO",
      conferida: false,
      valor: 4000,
    });
  });

  // ─────────────────── A justificativa, e a trilha ───────────────────

  it("com a razão escrita a taxa entra, é gravada, e a TRILHA guarda os números", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const res = await registrar(bloqueio.id, {
      descricao: "Mancha de tinta pequena",
      tipo: "LIMPEZA",
      custoReparo: 120,
      justificativaDaTaxa: "Mancha de 2 cm; a lavanderia cobrou R$ 120,00 e a dona autorizou.",
    });
    expect(res.status).toBe(201);
    expect(res.body.justificativaDaTaxa).toContain("a dona autorizou");

    const [trilha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.lojaId, f.lojaId), eq(auditLogTable.acao, "AVARIA_FORA_DA_FAIXA")))
      .orderBy(desc(auditLogTable.criadoEm))
      .limit(1);
    expect(trilha, "a taxa fora da faixa entrou sem deixar rastro").toBeTruthy();
    expect(trilha!.entidadeId).toBe(res.body.id);
    expect(trilha!.detalhe).toMatchObject({
      clausula: "14ª",
      valor: 120,
      piso: 350,
      motivo: "ABAIXO_DO_PISO",
    });
  });

  it("justificativa colada numa taxa que CABE não vira selo — o campo fica nulo", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const res = await registrar(bloqueio.id, {
      descricao: "Barra suja",
      tipo: "LIMPEZA",
      custoReparo: 900,
      justificativaDaTaxa: "porque sim",
    });
    expect(res.status).toBe(201);
    expect(res.body.justificativaDaTaxa).toBeNull();
  });

  it("avaria SEM custo continua entrando — a cláusula governa cobrança, não registro", async () => {
    const { bloqueio } = await noivaComPecaContratada(null);
    const res = await registrar(bloqueio.id, { descricao: "Ver com a costureira", tipo: "DANO" });
    expect(res.status).toBe(201);
    expect(res.body.custoReparo).toBeNull();
  });

  it("sem `tipo` no corpo, a avaria nasce DANO — o mesmo default da coluna", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const res = await registrar(bloqueio.id, { descricao: "Puído", custoReparo: 80 });
    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe("DANO");
  });

  // ─────────────────── A cobrança, onde nasce o dinheiro ───────────────────

  it("a razão escrita no registro sobrevive à cobrança, e ela não pede outra", async () => {
    // A avaria nasce ACIMA do teto conhecido, com a razão escrita; a cobrança
    // no mesmo contrato não volta a cobrar a explicação de quem já a deu.
    const { bloqueio, contrato } = await noivaComPecaContratada(400); // teto R$ 2.000,00
    const criada = await registrar(bloqueio.id, {
      descricao: "Véu destruído",
      tipo: "DANO",
      custoReparo: 4000,
      justificativaDaTaxa: "Peça exclusiva; a dona autorizou o conserto integral.",
    });
    expect(criada.status).toBe(201);
    expect(criada.body.justificativaDaTaxa).toContain("exclusiva");

    const cobrada = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${criada.body.id}/cobrar`)
      .send({ contratoId: contrato.id });
    expect(cobrada.status).toBe(201);
  });

  it("a cobrança recusa a taxa acima do teto quando NINGUÉM escreveu a razão", async () => {
    const { vestido, bloqueio, contrato } = await noivaComPecaContratada(3000);
    // Nasce dentro do teto de R$ 15.000,00.
    const criada = await registrar(bloqueio.id, {
      descricao: "Cauda destruída",
      tipo: "DANO",
      custoReparo: 9000,
    });
    expect(criada.status).toBe(201);
    expect(criada.body.justificativaDaTaxa).toBeNull();

    // O item do contrato encolhe — o mesmo efeito de cobrar noutro contrato,
    // sem precisar de uma segunda noiva para encená-lo.
    await db
      .update(contratoItensTable)
      .set({ valorUnitario: 500 }) // teto passa a R$ 2.500,00
      .where(and(
        eq(contratoItensTable.contratoId, contrato.id),
        eq(contratoItensTable.vestidoId, vestido.id),
      ));

    const semRazao = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${criada.body.id}/cobrar`)
      .send({ contratoId: contrato.id });
    expect(semRazao.status).toBe(422);
    expect(semRazao.body.error).toBe("TAXA_FORA_DA_FAIXA");
    expect(semRazao.body.detalhe).toContain("2.500,00");

    // E a razão no CORPO desfaz o beco: sem esta porta a única saída seria
    // APAGAR a avaria, cuja foto é a prova que sustenta a cobrança (E97/F23).
    const comRazao = await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${criada.body.id}/cobrar`)
      .send({
        contratoId: contrato.id,
        justificativaDaTaxa: "Dano à peça exclusiva; a dona autorizou o valor cheio do conserto.",
      });
    expect(comRazao.status).toBe(201);

    // A razão fica GRAVADA na avaria, não só na trilha: a próxima leitura da
    // ficha vê o valor com a explicação ao lado.
    const [depois] = await db.select().from(avariasTable).where(eq(avariasTable.id, criada.body.id));
    expect(depois!.justificativaDaTaxa).toContain("peça exclusiva");
  });
});
