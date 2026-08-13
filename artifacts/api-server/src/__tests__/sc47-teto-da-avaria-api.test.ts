import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contratoItensTable, db } from "@workspace/db";
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
 * **S-C47 — a tela e a porta perguntavam o teto a contratos diferentes.**
 *
 * A cláusula 15ª limita a taxa de dano a **5× o valor do aluguel daquela peça**
 * (E214), e o aluguel sai de `contrato_itens.valor_unitario`. A pergunta que
 * ficou aberta é **de qual contrato**:
 *
 * - a tela (`faixa-da-avaria.ts`) perguntava ao contrato **ATIVO da noiva**;
 * - a porta pergunta ao contrato que **COBRA** o reparo quando há cobrança viva,
 *   e ao ATIVO da dona do bloqueio quando não há.
 *
 * **A correção ao diagnóstico vem antes do conserto**, e está pregada aqui: o
 * caso que a sobra nomeia — *"a noiva cancelou um contrato e fez outro"* — NÃO
 * diverge, porque cancelar o contrato cancela as parcelas em ABERTO (E49/E94) e
 * a cobrança deixa de ser viva; o teto volta sozinho ao contrato novo. O que
 * diverge de verdade é o **bloqueio SEM dona**: `POST /avarias/:id/cobrar` só
 * compara a noiva do contrato com a dona do bloqueio *quando ela existe*
 * (E110/V3), então o reparo de um véu sem dona entra no carnê de qualquer noiva
 * da loja — e ali a tela não tem contrato nenhum para perguntar. Ela anunciava
 * *"esta peça não está em contrato nenhum — o valor entra SEM ser conferido"*
 * sobre um véu cujo teto é **R$ 2.000,00**, e o PATCH devolvia 422.
 *
 * O conserto é o do E212 e a lição é a do E187: **o payload DIZ o número que a
 * porta usou** (`aluguelDaPeca`), e a tela lê em vez de recalcular por outro
 * caminho. Este arquivo prega que as quatro portas que serializam uma avaria
 * dizem o mesmo número que a porta que decide.
 */
describe("S-C47 — o teto da avaria sai de um contrato só, e o payload diz qual", () => {
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

  async function itemDeContrato(contratoId: string, vestidoId: string, valorUnitario: number) {
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId,
      tipo: "VESTIDO",
      vestidoId,
      descricao: "Peça do contrato",
      valorUnitario,
      quantidade: 1,
    });
  }

  /** A noiva, a peça e o contrato ATIVO que a vendeu — o arranjo do E214/S-C11. */
  async function noivaComPecaContratada(aluguelDaPeca: number) {
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
      valorTotal: aluguelDaPeca,
      fechadoEm: dataFutura(-5),
    });
    await itemDeContrato(contrato.id, vestido.id, aluguelDaPeca);
    return { lead, vestido, bloqueio, contrato };
  }

  const registrar = (bloqueioId: string, corpo: Record<string, unknown>) =>
    agent.post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`).send(corpo);

  const listar = (bloqueioId: string) =>
    agent.get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`);

  const cobrar = (avariaId: string, contratoId: string, corpo: Record<string, unknown> = {}) =>
    agent.post(`/api/lojas/${f.lojaId}/avarias/${avariaId}/cobrar`).send({ contratoId, ...corpo });

  const editar = (avariaId: string, corpo: Record<string, unknown>) =>
    agent.patch(`/api/lojas/${f.lojaId}/avarias/${avariaId}`).send(corpo);

  // ───────── as quatro portas dizem o mesmo número ─────────

  it("o registro devolve o aluguel do contrato ATIVO da dona — o vestido de R$ 3.000,00", async () => {
    const { bloqueio } = await noivaComPecaContratada(3000);
    const criada = await registrar(bloqueio.id, {
      descricao: "Rasgo na barra",
      tipo: "DANO",
      custoReparo: 900,
    });
    expect(criada.status).toBe(201);
    expect(
      criada.body.aluguelDaPeca,
      "a tela não tem como saber contra qual aluguel a porta conferiu",
    ).toBe(3000);

    const lista = await listar(bloqueio.id);
    expect(lista.status).toBe(200);
    expect(lista.body[0].aluguelDaPeca).toBe(3000);
  });

  it("cobrada, a avaria passa a responder ao contrato que COBRA — e o payload acompanha", async () => {
    const { bloqueio, contrato, vestido } = await noivaComPecaContratada(3000);
    // O MESMO vestido vale menos no contrato que vai cobrar: é o caso que o
    // E214 registrou (a peça cobrada num contrato em que ela vale menos). Aqui
    // ele é o próprio contrato da noiva, com uma segunda linha mais barata — o
    // desempate é a MAIOR, dos dois lados, e continua sendo 3.000.
    await itemDeContrato(contrato.id, vestido.id, 800);
    const criada = await registrar(bloqueio.id, {
      descricao: "Mancha que não sai",
      tipo: "DANO",
      custoReparo: 900,
    });
    expect(criada.status).toBe(201);

    const cobrada = await cobrar(criada.body.id, contrato.id);
    expect(cobrada.status).toBe(201);
    expect(cobrada.body.aluguelDaPeca).toBe(3000);

    const lista = await listar(bloqueio.id);
    expect(lista.body[0].parcelaStatus).toBe("PREVISTA");
    expect(lista.body[0].aluguelDaPeca).toBe(3000);
  });

  it("a edição devolve o MESMO aluguel com que decidiu o 422", async () => {
    const { bloqueio } = await noivaComPecaContratada(400); // teto R$ 2.000,00
    const criada = await registrar(bloqueio.id, {
      descricao: "Véu queimado",
      tipo: "DANO",
      custoReparo: 300,
    });
    expect(criada.status).toBe(201);
    expect(criada.body.aluguelDaPeca).toBe(400);

    const recusada = await editar(criada.body.id, { custoReparo: 9000 });
    expect(recusada.status).toBe(422);
    expect(recusada.body.detalhe).toContain("2.000,00");

    const aceita = await editar(criada.body.id, { custoReparo: 1800 });
    expect(aceita.status).toBe(200);
    expect(
      aceita.body.aluguelDaPeca,
      "a resposta do PATCH tem de dizer o aluguel que ela mesma usou",
    ).toBe(400);
  });

  // ───────── a divergência que existia, medida ─────────

  it("o véu do bloqueio SEM dona: a tela dizia 'sem teto' e a porta cobra R$ 2.000,00", async () => {
    const casamento = dataFutura(40);
    const veu = await criarVestido(f);
    // Bloqueio sem `lead_id` e sem reserva-mãe — `donoDoBloqueio` devolve null.
    // São 102 de 227 no `heliumdb`, e a porta de cobrança só compara a noiva do
    // contrato com a dona do bloqueio QUANDO ela existe (E110/V3).
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: veu.id,
      casamentoData: casamento,
    });
    // O carnê é de OUTRA noiva, e nele o véu vale R$ 400,00 → teto R$ 2.000,00.
    const outraNoiva = await criarLead(f);
    const contratoDela = await criarContrato(f, {
      leadId: outraNoiva.id,
      valorTotal: 4000,
      fechadoEm: dataFutura(-5),
    });
    await itemDeContrato(contratoDela.id, veu.id, 400);

    // Sem dona não há contrato derivado: o registro entra sem teto conferido, e
    // isso a tela já sabia dizer.
    const criada = await registrar(bloqueio.id, {
      descricao: "Véu rasgado na devolução",
      tipo: "DANO",
      custoReparo: 1500,
    });
    expect(criada.status).toBe(201);
    expect(criada.body.aluguelDaPeca).toBeNull();

    const cobrada = await cobrar(criada.body.id, contratoDela.id);
    expect(cobrada.status).toBe(201);
    // **Aqui estava a divergência**: a partir deste ponto a porta tem teto
    // (R$ 2.000,00) e a tela continuava sem ter o que perguntar.
    expect(
      cobrada.body.aluguelDaPeca,
      "a tela não tem contrato para perguntar, e passava a oferecer o que o 422 recusa",
    ).toBe(400);

    const lista = await listar(bloqueio.id);
    expect(lista.body[0].aluguelDaPeca).toBe(400);

    // E o 422 confirma que o número do payload é o que decide: os R$ 2.500,00
    // que a tela deixaria salvar levam a faixa na cara.
    const recusada = await editar(criada.body.id, { custoReparo: 2500 });
    expect(recusada.status).toBe(422);
    expect(recusada.body.error).toBe("TAXA_FORA_DA_FAIXA");
    expect(recusada.body.detalhe).toContain("2.000,00");
  });

  // ───────── a correção ao diagnóstico da sobra ─────────

  it("cancelado o contrato, o teto volta ao ATIVO da dona — o caso da sobra NÃO divergia", async () => {
    const { lead, vestido, bloqueio, contrato } = await noivaComPecaContratada(400);
    const criada = await registrar(bloqueio.id, {
      descricao: "Renda solta na cauda",
      tipo: "DANO",
      custoReparo: 800,
      justificativaDaTaxa: "Dano na renda importada, orçamento da ateliê de bordado",
    });
    expect(criada.status).toBe(201);

    const cobrada = await cobrar(criada.body.id, contrato.id, {
      justificativaDaTaxa: "Dano na renda importada, orçamento da ateliê de bordado",
    });
    expect(cobrada.status).toBe(201);
    expect(cobrada.body.aluguelDaPeca).toBe(400);

    // O contrato cai, e com ele a parcela do reparo (E49/E94: as em ABERTO
    // viram CANCELADA). A cobrança deixa de ser viva.
    const cancelamento = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "Noiva trocou de vestido" });
    expect(cancelamento.status).toBe(200);

    // A noiva assina outro, e nele a MESMA peça vale R$ 3.000,00 — é o cenário
    // do `e2e/62-avaria-fecha.spec.ts`, e é justamente onde a sobra supunha a
    // divergência. Não há: sem cobrança viva, as duas pontas derivam o ATIVO.
    const novo = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: dataFutura(-1),
    });
    await itemDeContrato(novo.id, vestido.id, 3000);

    const lista = await listar(bloqueio.id);
    expect(lista.body[0].parcelaStatus).toBe("CANCELADA");
    expect(lista.body[0].aluguelDaPeca).toBe(3000);
  });
});
