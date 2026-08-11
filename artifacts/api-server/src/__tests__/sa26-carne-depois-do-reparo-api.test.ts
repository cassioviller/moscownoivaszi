import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, parcelasTable, avariasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarBloqueio,
  criarContrato,
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
 * S-A26 (sobra S26 da rodada 6) — cobrado um reparo, o contrato voltava a
 * conseguir gerar o carnê.
 *
 * O E110 consertou a colisão na ordem "carnê primeiro, reparo depois". A ordem
 * INVERSA continuou quebrada, e é a mais natural no balcão: a peça volta
 * avariada, a loja cobra o conserto, e só então monta o parcelamento.
 *
 *     contratos.ts:1204   if (contrato.parcelas.length > 0) → 409 JA_TEM_PLANO
 *
 * **QUALQUER parcela**, não "parcela de carnê". Cobrada a avaria, o contrato
 * ficava em `409 JA_TEM_PLANO` para sempre, e o carnê da noiva nunca existia —
 * uma venda inteira parcelada fora do sistema por causa de um reparo de R$ 350.
 *
 * A sobra previa que o conserto exigiria "renumerar o carnê ou deslocar o
 * plano — decisão sobre o que a noiva vê no boleto". **Medido, não exige**: o
 * que a noiva lê é `descricao` ("Entrada", "Parcela 1/6", "Reparo de avaria —
 * …"), e o `numero` é ordenação. O que ele NÃO pode perder é a régua
 * `numero === 0 → Entrada`, que seis pontos leem (as três telas, o portal, a
 * conciliação e o PDF do contrato) — e é por isso que o plano continua nascendo
 * em 0..N e quem se desloca é o reparo.
 */
describe("S26 — o carnê nasce mesmo depois de o reparo ter sido cobrado", () => {
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

  const parcelasDe = (contratoId: string) =>
    db.select().from(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));

  /** Uma noiva com contrato ATIVO e um reparo JÁ COBRADO — a ordem do balcão. */
  async function contratoComReparoCobrado(custoReparo = 350) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      vestidoId: vestido.id,
      tipo: "RESERVA_CASAMENTO",
      casamentoData: dataFutura(90),
      leadId: lead.id,
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-5),
    });
    const avaria = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Barra rasgada", custoReparo })
      .expect(201);
    await agent
      .post(`/api/lojas/${f.lojaId}/avarias/${avaria.body.id}/cobrar`)
      .send({ contratoId: contrato.id })
      .expect(201);
    return { contrato, avaria: avaria.body as { id: string } };
  }

  const gerarPlano = (contratoId: string, entrada = 1000, numParcelas = 4) =>
    agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`)
      .send({ entrada, numParcelas, primeiroVencimento: dataFutura(30).toISOString().slice(0, 10) });

  it("o reparo cobrado antes NÃO tranca o carnê — era 409 para sempre", async () => {
    const { contrato } = await contratoComReparoCobrado(350);
    await gerarPlano(contrato.id, 1000, 4).expect(201);
  });

  it("a entrada nasce no numero 0 — a régua que seis telas leem", async () => {
    const { contrato } = await contratoComReparoCobrado(350);
    await gerarPlano(contrato.id, 1000, 4).expect(201);

    const parcelas = await parcelasDe(contrato.id);
    const entrada = parcelas.find((p) => p.descricao === "Entrada")!;
    expect(entrada.numero).toBe(0);
    expect(entrada.valorPrevisto).toBe(1000);
    // Cinco linhas de carnê (entrada + 4) e a do reparo.
    expect(parcelas).toHaveLength(6);
  });

  it("o reparo vai para o FIM da lista, e continua sendo o mesmo reparo", async () => {
    const { contrato, avaria } = await contratoComReparoCobrado(350);
    const antes = await parcelasDe(contrato.id);
    const idDoReparo = antes[0]!.id;
    expect(antes[0]!.numero).toBe(1); // era o primeiro número livre do contrato vazio

    await gerarPlano(contrato.id, 1000, 4).expect(201);

    const depois = await parcelasDe(contrato.id);
    const reparo = depois.find((p) => p.id === idDoReparo)!;
    // Deslocado para depois do carnê — e é a MESMA linha: mesmo id, mesmo
    // valor, e a avaria continua apontando para ela.
    expect(reparo.numero).toBe(5);
    expect(reparo.valorPrevisto).toBe(350);
    expect(reparo.descricao).toContain("Reparo de avaria");
    const [avariaNoBanco] = await db
      .select()
      .from(avariasTable)
      .where(eq(avariasTable.id, avaria.id));
    expect(avariaNoBanco!.parcelaId).toBe(idDoReparo);
  });

  it("o carnê continua sendo UM só — a segunda tentativa é recusada", async () => {
    const { contrato } = await contratoComReparoCobrado(350);
    await gerarPlano(contrato.id, 1000, 4).expect(201);

    const r = await gerarPlano(contrato.id, 500, 3).expect(409);
    expect(r.body.error).toBe("JA_TEM_PLANO");
  });

  /**
   * S-M3 — e o carnê que entra pela PORTA DA FRENTE não era carnê nenhum.
   *
   * Os quatro casos acima montam o plano pelo `gerar-plano`. A tela de fechar
   * venda não usa essa porta: ela manda o carnê inteiro dentro do
   * `POST /contratos` (`orcamentos/[id].tsx:672`, as linhas do próprio
   * `montarPlanoParcelas`). Essas parcelas nasciam com o default da coluna —
   * `AVULSA` —, e o `jaTemCarne` só reconhece `PLANO`: o contrato fechado com
   * carnê aceitava montar OUTRO por cima, e a soma dobrava.
   */
  it("S-M3 — o carnê do fechamento também é carnê: gerar outro é 409", async () => {
    const lead = await criarLead(f);
    const r = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.superAdminId,
        valorTotal: 5000,
        // O que a tela manda: entrada em `numero 0` mais três parcelas, somando
        // o total exato (é a guarda de `:287` que obriga).
        parcelas: [
          { numero: 0, descricao: "Entrada", valorPrevisto: 2000, vencimento: dataFutura(1).toISOString() },
          { numero: 1, descricao: "Parcela 1/3", valorPrevisto: 1000, vencimento: dataFutura(31).toISOString() },
          { numero: 2, descricao: "Parcela 2/3", valorPrevisto: 1000, vencimento: dataFutura(61).toISOString() },
          { numero: 3, descricao: "Parcela 3/3", valorPrevisto: 1000, vencimento: dataFutura(91).toISOString() },
        ],
      })
      .expect(201);
    const contratoId = r.body.id as string;

    // VERMELHO ANTES: as quatro nasciam `AVULSA`.
    const nascidas = await parcelasDe(contratoId);
    expect(nascidas).toHaveLength(4);
    expect(nascidas.every((p) => p.origem === "PLANO")).toBe(true);

    // VERMELHO ANTES: 201 — a venda de R$ 5.000,00 ficava com R$ 10.000,00 em
    // parcelas, e a entrada verdadeira era empurrada para fora do `numero 0`
    // pelo deslocamento do S26.
    const segundo = await gerarPlano(contratoId, 1000, 4).expect(409);
    expect(segundo.body.error).toBe("JA_TEM_PLANO");

    const depois = await parcelasDe(contratoId);
    expect(depois).toHaveLength(4);
    expect(depois.reduce((acc, p) => acc + p.valorPrevisto, 0)).toBe(5000);
    expect(depois.find((p) => p.numero === 0)!.descricao).toBe("Entrada");
  });

  it("a parcela AVULSA é da mesma família, e também não tranca o carnê", async () => {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 5000,
      fechadoEm: dataFutura(-5),
    });
    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/parcelas`)
      .send({
        descricao: "Taxa de urgência",
        valorPrevisto: 120,
        vencimento: dataFutura(10).toISOString(),
      })
      .expect(201);

    await gerarPlano(contrato.id, 1000, 4).expect(201);

    const parcelas = await parcelasDe(contrato.id);
    expect(parcelas.find((p) => p.descricao === "Entrada")!.numero).toBe(0);
    expect(parcelas.find((p) => p.descricao === "Taxa de urgência")!.numero).toBe(5);
  });

  it("sem entrada, o carnê começa na parcela 1 e o slot 0 fica livre", async () => {
    const { contrato } = await contratoComReparoCobrado(200);
    // Entrada zero: `montarPlanoParcelas` não emite a linha 0 nenhuma.
    await gerarPlano(contrato.id, 0, 3).expect(201);

    const parcelas = await parcelasDe(contrato.id);
    expect(parcelas.some((p) => p.numero === 0)).toBe(false);
    expect(parcelas.filter((p) => p.descricao?.startsWith("Parcela")).map((p) => p.numero)).toEqual([
      1, 2, 3,
    ]);
    expect(parcelas.find((p) => p.descricao?.startsWith("Reparo"))!.numero).toBe(4);
  });

  it("S-M19 — a RESPOSTA da API carrega `origem`: é por ela que a tela decide se mostra o Gerar plano", async () => {
    /**
     * O servidor decidia certo desde a S26, mas o schema `Parcela` do OpenAPI
     * não declarava `origem` — o `Response.parse` STRIPAVA a coluna e a tela,
     * sem o dado, perguntava `parcelas.length > 0`: o reparo cobrado antes do
     * carnê escondia o "Gerar plano" para sempre (achado 5#1 da rodada 2,
     * 🟠). Este teste prega a fronteira: a parcela do reparo chega à tela
     * dizendo AVARIA, e a de carnê dizendo PLANO.
     */
    const { contrato } = await contratoComReparoCobrado(350);

    const antes = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(200);
    const parcelasAntes = antes.body.parcelas as { origem?: string }[];
    expect(parcelasAntes).toHaveLength(1);
    expect(parcelasAntes[0]!.origem).toBe("AVARIA");

    await gerarPlano(contrato.id, 1000, 4).expect(201);

    const depois = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}`).expect(200);
    const origens = (depois.body.parcelas as { origem: string }[]).map((p) => p.origem).sort();
    expect(origens).toEqual(["AVARIA", "PLANO", "PLANO", "PLANO", "PLANO", "PLANO"]);
  });
});
