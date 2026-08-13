import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bloqueioVestidosTable,
  contratoBloqueiosTable,
  contratoItensTable,
  contratosTable,
  db,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
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
 * **As três órfãs do contrato — S-C80, S-C85 e S-C86.**
 *
 * As três nascem da mesma pergunta feita em três lugares: *de quem é esta peça,
 * e qual contrato responde por ela?* Onde a resposta é "nenhum", o sistema não
 * parava — ele escolhia.
 *
 * - **S-C80** — a cobrança do reparo só compara a noiva do contrato com a dona
 *   do bloqueio **quando ela existe** (E110/V3). Sem dona, o reparo de
 *   R$ 1.500,00 de um véu entra no carnê de **qualquer** noiva ATIVA da loja.
 * - **S-C85** — `pecasAtrasadasDoContrato` não olha `canceladoEm`, e a PRÉVIA
 *   não olha o status do contrato: ela anuncia R$ 4.750,00 sobre um contrato
 *   CANCELADO que o `POST` recusa com 422.
 * - **S-C86** — a fila e a prévia varrem `contratos → contrato_bloqueios`, então
 *   a peça retirada num bloqueio sem contrato ATIVO é **invisível** para a 16ª,
 *   enquanto `disponibilidade.ts` a pinta `ATRASO_DEVOLUCAO`.
 *
 * População medida em 13/08/2026, antes da primeira linha (`heliumdb`, o banco
 * de `DATABASE_URL`, e `moscow_base` ao lado): **0 avarias** nos dois,
 * **0 bloqueios com retirada registrada** nos dois, **0 bloqueios cancelados**
 * nos dois, e **102 de 227 bloqueios sem dona** no `heliumdb` (0 de 116 em
 * `moscow_base`). O que estava aberto é o MECANISMO — e nos três casos ele
 * decide dinheiro.
 */
describe("S-C80/S-C85/S-C86 — a peça sem dona, a cancelada e a sem contrato", () => {
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

  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

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

  // ───────── S-C80 — o reparo sem dona não escolhe carnê ─────────

  const registrar = (bloqueioId: string, corpo: Record<string, unknown>) =>
    agent.post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueioId}/avarias`).send(corpo);

  const cobrar = (avariaId: string, contratoId: string) =>
    agent.post(`/api/lojas/${f.lojaId}/avarias/${avariaId}/cobrar`).send({ contratoId });

  /** O contrato ATIVO de uma noiva que não tem nada com a peça avariada. */
  async function contratoDeOutraNoiva(vestidoId: string, aluguel: number) {
    const outra = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: outra.id,
      valorTotal: 4000,
      fechadoEm: dataFutura(-5),
    });
    await itemDeContrato(contrato.id, vestidoId, aluguel);
    return contrato;
  }

  /**
   * **O 201 que a S-C47 mediu, e que este épico transforma em 422.**
   *
   * Um véu sem `lead_id` e sem reserva-mãe: `donoDoBloqueio` devolve `null`, a
   * guarda `AVARIA_DE_OUTRA_NOIVA` não tem o que comparar e segue em frente —
   * e o reparo de **R$ 1.500,00** vira parcela no carnê de uma noiva que não
   * causou o dano, com o extrato do portal dela mostrando a cobrança.
   */
  it("o reparo do véu SEM dona não entra no carnê de noiva nenhuma", async () => {
    const veu = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: veu.id,
      casamentoData: dataFutura(40),
    });
    const contratoDela = await contratoDeOutraNoiva(veu.id, 400);

    const criada = await registrar(bloqueio.id, {
      descricao: "Véu rasgado na devolução",
      tipo: "DANO",
      custoReparo: 1500,
    });
    expect(criada.status).toBe(201);

    const recusada = await cobrar(criada.body.id, contratoDela.id);
    expect(
      recusada.status,
      "sem dona, a guarda não compara nada e o reparo cai em qualquer carnê ATIVO da loja",
    ).toBe(422);
    expect(recusada.body.error).toBe("AVARIA_SEM_DONA");

    // E o dinheiro não nasceu: a avaria continua sem parcela.
    const lista = await agent.get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`).expect(200);
    expect(lista.body[0].parcelaId ?? null).toBeNull();
  });

  /**
   * O que a recusa **não** pode alcançar: o véu pendurado na reserva-mãe TEM
   * dona (V3/E163 — `reservas.lead_id` é NOT NULL), ela só não é própria. Fechar
   * demais aqui desfaria o E163 e o E167 de uma vez.
   */
  it("o véu pendurado na reserva-mãe continua cobrável — a dona existe, só não é própria", async () => {
    const noiva = await criarLead(f);
    const veu = await criarVestido(f);
    const reserva = await criarReserva(f, { leadId: noiva.id, casamentoData: dataFutura(40) });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: veu.id,
      leadId: null,
      reservaId: reserva.id,
      casamentoData: dataFutura(40),
    });
    const contrato = await criarContrato(f, {
      leadId: noiva.id,
      valorTotal: 4000,
      fechadoEm: dataFutura(-5),
    });
    await itemDeContrato(contrato.id, veu.id, 400);

    const criada = await registrar(bloqueio.id, {
      descricao: "Renda solta",
      tipo: "DANO",
      custoReparo: 900,
    });
    expect(criada.status).toBe(201);
    const cobrada = await cobrar(criada.body.id, contrato.id);
    expect(cobrada.status, "a dona derivada é a da reserva-mãe").toBe(201);
  });

  /**
   * A avaria nasce presa ao BLOQUEIO, não ao contrato: registrar o dano é um
   * fato (a peça está rasgada), e escolher o carnê é a decisão de dinheiro.
   * O que este épico recusa é a segunda, não a primeira.
   */
  it("registrar a avaria da peça sem dona continua entrando — o que se recusa é o DINHEIRO", async () => {
    const veu = await criarVestido(f);
    const bloqueio = await criarBloqueio(f, { tipo: "MANUTENCAO", vestidoId: veu.id });
    const criada = await registrar(bloqueio.id, {
      descricao: "Barra descosturada na manutenção",
      tipo: "DANO",
      custoReparo: 300,
    });
    expect(criada.status).toBe(201);
    expect(criada.body.aluguelDaPeca ?? null).toBeNull();
  });

  // ───────── S-C85 — cancelar não devolve o vestido ─────────

  /** A montagem do E212/S-C32: contrato ATIVO, peça retirada, rol de itens. */
  async function contratoComPecaAtrasada(params: {
    casamentoHaDias: number;
    devolvidoHaDias?: number | null;
    aluguel?: number | null;
    retirado?: boolean;
  }) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = diasAtras(params.casamentoHaDias);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      casamentoData: casamento,
      retiradaDataReal:
        params.retirado === false ? null : diasAtras(params.casamentoHaDias + 3),
      devolucaoDataReal:
        params.devolvidoHaDias === null || params.devolvidoHaDias === undefined
          ? null
          : diasAtras(params.devolvidoHaDias),
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 3000,
      fechadoEm: dataFutura(-30),
    });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
    if (params.aluguel !== null) {
      await itemDeContrato(contrato.id, vestido.id, params.aluguel ?? 3000);
    }
    return { lead, vestido, bloqueio, contrato };
  }

  const previa = (contratoId: string) =>
    agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cobranca-de-atraso`);

  /**
   * **A prévia e o `POST` respondem a MESMA pergunta, e davam respostas
   * diferentes.** O `POST` recusa o contrato não-ATIVO com 422
   * `CONTRATO_NAO_ATIVO` (`reservas.ts`); a prévia não olhava o status e
   * anunciava R$ 3.750,00 sobre um carnê que ninguém pode cobrar. É o formato
   * do E213 invertido — quatro leituras do mesmo número, e a única que decide
   * dizia não.
   */
  it("a prévia de um contrato CANCELADO responde o mesmo que o POST: 422", async () => {
    const { contrato } = await contratoComPecaAtrasada({ casamentoHaDias: 9 });
    const antes = await previa(contrato.id).expect(200);
    expect(antes.body.devida).toBe(true);
    // 7 dias × R$ 500,00 + R$ 250,00 de multa.
    expect(antes.body.valor).toBe(3750);

    await db
      .update(contratosTable)
      .set({ status: "CANCELADO", canceladoEm: new Date() })
      .where(eq(contratosTable.id, contrato.id));

    const recusada = await previa(contrato.id);
    expect(
      recusada.status,
      "a prévia anunciava R$ 3.750,00 num contrato que o POST recusa com 422",
    ).toBe(422);
    expect(recusada.body.error).toBe("CONTRATO_NAO_ATIVO");

    const post = await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
      .send({});
    expect(post.status).toBe(422);
    expect(post.body.error).toBe("CONTRATO_NAO_ATIVO");
  });

  /**
   * **A decisão declarada:** `canceladoEm` no bloqueio não decide nada — quem
   * decide é `retiradaDataReal`. A peça que SAIU e não voltou continua fora da
   * arara, e cancelar a reserva é um gesto administrativo que não a traz de
   * volta. Sem esta linha, cancelar viraria a porta dos fundos da 16ª: os
   * R$ 12.000,00 do extravio sumiriam com um clique.
   *
   * O `canceladoEm` é escrito direto porque as duas portas que o gravam
   * (`PATCH /reservas` e `POST /contratos/:id/cancelar`) recusam ou derrubam o
   * contrato ATIVO junto — é o estado, não o caminho, que está sendo pregado.
   */
  it("cancelar a reserva de uma peça JÁ RETIRADA não a devolve: ela continua atrasando", async () => {
    const { contrato, bloqueio } = await contratoComPecaAtrasada({ casamentoHaDias: 9 });
    await db
      .update(bloqueioVestidosTable)
      .set({ canceladoEm: new Date() })
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));

    const r = await previa(contrato.id).expect(200);
    expect(r.body.devida).toBe(true);
    expect(r.body.maiorAtraso).toBe(7);
    expect(r.body.valor).toBe(3750);
  });

  /** O outro lado da mesma decisão: o que nunca saiu não tem o que devolver. */
  it("cancelar ANTES da retirada não cria atraso nenhum — não houve locação", async () => {
    const { contrato, bloqueio } = await contratoComPecaAtrasada({
      casamentoHaDias: 60,
      retirado: false,
    });
    await db
      .update(bloqueioVestidosTable)
      .set({ canceladoEm: new Date() })
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));

    const r = await previa(contrato.id).expect(200);
    expect(r.body.devida).toBe(false);
    expect(r.body.valor).toBe(0);
  });

  // ───────── S-C86 — a peça fora que nenhum contrato cobre ─────────

  const fila = () => agent.get(`/api/lojas/${f.lojaId}/contratos-com-atraso`);

  type ForaSemContrato = {
    bloqueioId: string;
    vestidoNome: string;
    leadId: string | null;
    noivaNome: string | null;
    dias: number;
  };

  async function semContratoNaFila(bloqueioId: string) {
    const r = await fila().expect(200);
    const corpo = r.body as { itens: unknown[]; semContrato: ForaSemContrato[]; pecas: number; valor: number };
    return { corpo, linha: (corpo.semContrato ?? []).find((s) => s.bloqueioId === bloqueioId) };
  }

  /** A peça retirada num bloqueio que nunca virou contrato. */
  async function pecaForaSemContrato(casamentoHaDias: number, devolvidoHaDias: number | null = null) {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = diasAtras(casamentoHaDias);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      casamentoData: casamento,
      retiradaDataReal: diasAtras(casamentoHaDias + 3),
      devolucaoDataReal: devolvidoHaDias === null ? null : diasAtras(devolvidoHaDias),
    });
    return { lead, vestido, bloqueio };
  }

  /**
   * **O acervo pinta a peça de vermelho e a régua do dinheiro não a enxerga.**
   * `janelasDoBloqueio` devolve `ATRASO_DEVOLUCAO` para qualquer bloqueio com
   * retirada sem devolução depois do fim do uso — não pergunta por contrato
   * nenhum. A fila perguntava, e por isso a peça sumia dela.
   */
  it("a peça retirada e não devolvida SEM contrato aparece na fila, nomeada", async () => {
    const { bloqueio, vestido, lead } = await pecaForaSemContrato(9);
    const { linha } = await semContratoNaFila(bloqueio.id);
    expect(linha, "a fila varria contratos, e esta peça não tem um").toBeDefined();
    expect(linha!.dias).toBe(7);
    expect(linha!.vestidoNome).toBe(vestido.nome);
    expect(linha!.leadId).toBe(lead.id);
    expect(linha!.noivaNome).toBeTruthy();
  });

  /**
   * A outra metade da S-C85: cancelar o contrato solta o bloqueio
   * (`contratos.ts` grava `canceladoEm` em todos os vinculados) e a peça
   * continua na casa da noiva. O dinheiro morreu com o contrato; a peça, não —
   * e é aqui que ela passa a ser vista.
   */
  it("a peça do contrato CANCELADO cai em `semContrato`: o carnê morreu, a peça não voltou", async () => {
    const { contrato, bloqueio } = await contratoComPecaAtrasada({ casamentoHaDias: 12 });
    await db
      .update(contratosTable)
      .set({ status: "CANCELADO", canceladoEm: new Date() })
      .where(eq(contratosTable.id, contrato.id));
    await db
      .update(bloqueioVestidosTable)
      .set({ canceladoEm: new Date() })
      .where(eq(bloqueioVestidosTable.id, bloqueio.id));

    const { linha } = await semContratoNaFila(bloqueio.id);
    expect(linha).toBeDefined();
    expect(linha!.dias).toBe(10);
  });

  /**
   * **Ver não é cobrar.** A 16ª cobra sobre *"o valor do aluguel de cada peça"*,
   * e aluguel só existe em `contrato_itens`: sem contrato não há de onde tirar o
   * número. A decisão é a mesma do `semAluguel` do E212 — dizer que não se sabe,
   * em vez de inventar um valor **ou** de calar. Então a peça entra na CONTAGEM
   * e nunca no DINHEIRO.
   */
  it("a peça sem contrato conta como peça fora e não mexe um centavo no total", async () => {
    const antes = await fila().expect(200);
    const { bloqueio } = await pecaForaSemContrato(11);
    const { corpo } = await semContratoNaFila(bloqueio.id);
    expect(corpo.pecas).toBe(antes.body.pecas + 1);
    expect(corpo.valor).toBe(antes.body.valor);
  });

  it("a peça sem contrato devolvida no prazo não entra na fila", async () => {
    const { bloqueio } = await pecaForaSemContrato(10, 8);
    const { linha } = await semContratoNaFila(bloqueio.id);
    expect(linha).toBeUndefined();
  });

  /** A peça que está num contrato ATIVO continua no lado do dinheiro, e só nele. */
  it("a peça de contrato ATIVO não é contada duas vezes: ela é item, não órfã", async () => {
    const { contrato, bloqueio } = await contratoComPecaAtrasada({ casamentoHaDias: 9 });
    const r = await fila().expect(200);
    const corpo = r.body as { itens: { contratoId: string }[]; semContrato: ForaSemContrato[] };
    expect(corpo.itens.some((i) => i.contratoId === contrato.id)).toBe(true);
    expect(corpo.semContrato.some((s) => s.bloqueioId === bloqueio.id)).toBe(false);
  });
});
