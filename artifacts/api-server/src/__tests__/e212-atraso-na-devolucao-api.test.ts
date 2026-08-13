import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogTable,
  contratoBloqueiosTable,
  contratoItensTable,
  contratosTable,
  db,
  parcelasTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { addDias, ancoraDeNegocio, hojeLocal } from "@workspace/financeiro-core";
import {
  criarBloqueio,
  criarContrato,
  criarFixture,
  criarLead,
  criarReserva,
  criarVestido,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E212 — o atraso na devolução tem PREÇO** (contrato de locação, cláusula 16ª
 * e seus dois parágrafos).
 *
 * > **16ª** — A não devolução no prazo de 10 dias a contar da data prevista
 * > será considerada EXTRAVIO ou ROUBO, e o LOCATÁRIO pagará **quatro vezes** o
 * > valor do aluguel de cada peça.
 * > **§1º** — Em prazo inferior ao do caput, **um dia de aluguel extra para
 * > cada dia de atraso**, acrescido de **multa de R$ 250,00**.
 * > **§2º** — Os valores poderão ser aplicados **proporcionalmente** às peças
 * > que não foram devolvidas na data prevista.
 *
 * O sistema **já enxergava** o atraso: `disponibilidade.ts` pinta a janela
 * física como `ATRASO_DEVOLUCAO` quando há retirada sem devolução depois do fim
 * do uso previsto. A peça aparecia vermelha na tela do acervo e **nenhuma
 * cobrança nascia** — a conta não existia em linha nenhuma do código.
 *
 * A conta pura e a leitura declarada da "diária" estão em
 * `financeiro-core/atraso.ts` e na régua dela
 * (`moscow-noivas/src/lib/financeiro/atraso.test.ts`). Este arquivo prega o
 * outro lado: **o que a PORTA grava**.
 *
 * A loja da fixture usa a régua padrão — `usoDiasAntes` 3, `usoDiasDepois` 2 —,
 * então o fim do uso previsto é `casamento + 2` e a janela de aluguel são
 * **6 dias**. Um vestido de R$ 3.000,00 tem diária de R$ 500,00.
 */
describe("E212 — o atraso na devolução tem preço", () => {
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

  /** Um dia de negócio N dias atrás de hoje, como instante ancorado. */
  const diasAtras = (n: number) => ancoraDeNegocio(addDias(hojeLocal(), -n));

  /**
   * Uma noiva com contrato ATIVO e peças presas a ele.
   *
   * Cada peça vira três coisas: o vestido, o bloqueio (que carrega as datas
   * reais do ciclo) e a linha de `contrato_itens` — que é de onde sai o aluguel,
   * e sem a qual a 16ª não tem sobre o que incidir.
   */
  async function noivaComPecas(
    pecas: { aluguel: number; casamentoHaDias: number; devolvidoHaDias?: number | null; retirado?: boolean }[],
  ) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: pecas.reduce((s, p) => s + p.aluguel, 0),
      fechadoEm: new Date(),
    });
    const nomes: string[] = [];
    for (const [i, p] of pecas.entries()) {
      const vestido = await criarVestido(f);
      const casamento = diasAtras(p.casamentoHaDias);
      const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
      const bloqueio = await criarBloqueio(f, {
        tipo: "RESERVA_CASAMENTO",
        vestidoId: vestido.id,
        leadId: lead.id,
        reservaId: reserva.id,
        casamentoData: casamento,
        retiradaDataReal: p.retirado === false ? null : diasAtras(p.casamentoHaDias + 3),
        devolucaoDataReal:
          p.devolvidoHaDias === null || p.devolvidoHaDias === undefined
            ? null
            : diasAtras(p.devolvidoHaDias),
      });
      await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
      await db.insert(contratoItensTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        contratoId: contrato.id,
        tipo: "VESTIDO",
        vestidoId: vestido.id,
        descricao: vestido.nome,
        valorUnitario: p.aluguel,
        quantidade: 1,
      });
      nomes[i] = vestido.nome;
    }
    return { lead, contrato, nomes };
  }

  const previa = (contratoId: string) =>
    agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cobranca-de-atraso`);

  const cobrar = (contratoId: string) =>
    agent.post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/cobranca-de-atraso`).send({});

  const parcelasDeAtraso = (contratoId: string) =>
    db
      .select()
      .from(parcelasTable)
      .where(and(eq(parcelasTable.contratoId, contratoId), eq(parcelasTable.origem, "ATRASO_DEVOLUCAO")));

  const contratoDe = async (id: string) =>
    (await db.select().from(contratosTable).where(eq(contratosTable.id, id)))[0]!;

  it("devolução no prazo não deve nada, e `devida: false` não é erro", async () => {
    // Casamento há 10 dias, fim do uso previsto há 8, devolvida há 8 — o último
    // dia de dentro do prazo.
    const { contrato } = await noivaComPecas([{ aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 8 }]);

    const r = await previa(contrato.id).expect(200);
    expect(r.body.devida).toBe(false);
    expect(r.body.valor).toBe(0);

    await cobrar(contrato.id).expect(422).expect((res) => {
      expect(res.body.error).toBe("SEM_ATRASO");
    });
    expect(await parcelasDeAtraso(contrato.id)).toHaveLength(0);
  });

  it("três dias de atraso: R$ 1.500,00 de diárias + R$ 250,00 de multa, como PARCELA", async () => {
    // Casamento há 10 dias → fim do uso previsto há 8. Devolvida há 5 = 3 dias.
    const { contrato } = await noivaComPecas([{ aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 }]);

    const antes = await previa(contrato.id).expect(200);
    expect(antes.body.devida).toBe(true);
    expect(antes.body.linhas[0].dias).toBe(3);
    expect(antes.body.linhas[0].diaria).toBe(500);
    expect(antes.body.multa).toBe(250);
    expect(antes.body.valor).toBe(1750);
    expect(antes.body.jaCobrada).toBe(false);

    const r = await cobrar(contrato.id).expect(201);
    expect(r.body.valor).toBe(1750);
    expect(r.body.jaCobrada).toBe(true);

    const linhas = await parcelasDeAtraso(contrato.id);
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0]!.valorPrevisto)).toBe(1750);
    // O vínculo, que é o que impede o segundo clique de cobrar de novo.
    expect((await contratoDe(contrato.id)).atrasoParcelaId).toBe(linhas[0]!.id);
  });

  /**
   * **A conta que a tela imprimiu é a MESMA que a parcela gravou.** Duas
   * grafias divergiriam no dia em que a régua mudasse, e a noiva leria no carnê
   * um número que ninguém lhe mostrou — é a lição do E214 aplicada ao texto.
   */
  it("a descrição da parcela repete a frase da prévia, não uma segunda redação", async () => {
    const { contrato } = await noivaComPecas([{ aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 }]);
    const antes = await previa(contrato.id).expect(200);
    await cobrar(contrato.id).expect(201);
    const [linha] = await parcelasDeAtraso(contrato.id);
    expect(antes.body.explicacao).toContain("3 dia(s)");
    expect(linha!.descricao).toBe(`Atraso na devolução — ${antes.body.explicacao}`.slice(0, 200));
  });

  it("o segundo clique responde 409 e NÃO cria uma segunda parcela", async () => {
    const { contrato } = await noivaComPecas([{ aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 }]);
    await cobrar(contrato.id).expect(201);

    await cobrar(contrato.id).expect(409).expect((res) => {
      expect(res.body.error).toBe("ATRASO_JA_COBRADO");
    });
    expect(await parcelasDeAtraso(contrato.id)).toHaveLength(1);
  });

  it("doze dias é EXTRAVIO: 4× o aluguel, e sem a multa que o caput não menciona", async () => {
    // Casamento há 20 dias → fim do uso há 18. Devolvida há 6 = 12 dias.
    const { contrato } = await noivaComPecas([{ aluguel: 3000, casamentoHaDias: 20, devolvidoHaDias: 6 }]);

    const r = await previa(contrato.id).expect(200);
    expect(r.body.linhas[0].tipo).toBe("EXTRAVIO");
    expect(r.body.linhas[0].clausula).toBe("16ª");
    expect(r.body.multa).toBe(0);
    expect(r.body.valor).toBe(12_000);
    expect(r.body.temExtravio).toBe(true);
  });

  /**
   * O §2º repartindo, e não multiplicando: três peças atrasadas pagam três
   * diárias e **uma** multa. Ler o §2º como multiplicador daria R$ 750,00 só de
   * multa.
   */
  it("§2º — três peças atrasadas viram UMA parcela, com UMA multa", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 6 },
      { aluguel: 400, casamentoHaDias: 10, devolvidoHaDias: 6 },
      { aluguel: 200, casamentoHaDias: 10, devolvidoHaDias: 6 },
    ]);

    const r = await previa(contrato.id).expect(200);
    expect(r.body.linhas).toHaveLength(3);
    expect(r.body.multa).toBe(250);
    // 2 dias × (500,00 + 66,67 + 33,33) = 1.200,00, mais a multa.
    expect(r.body.valor).toBe(1200 + 250);

    await cobrar(contrato.id).expect(201);
    expect(await parcelasDeAtraso(contrato.id)).toHaveLength(1);
  });

  it("a peça devolvida no prazo não entra na conta das que atrasaram", async () => {
    const { contrato, nomes } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 },
      { aluguel: 400, casamentoHaDias: 10, devolvidoHaDias: 8 },
    ]);

    const r = await previa(contrato.id).expect(200);
    expect(r.body.linhas).toHaveLength(1);
    expect(r.body.linhas[0].descricao).toBe(nomes[0]);
  });

  /**
   * **A peça que nunca saiu não atrasa.** Sem `retiradaDataReal` não houve
   * locação daquela peça, e a 16ª fala de *"não devolução"* — o que nunca foi
   * retirado não tem o que devolver. Sem esta guarda, todo bloqueio antigo de
   * uma noiva viraria cobrança.
   */
  it("a peça que nunca foi retirada não atrasa, por mais antiga que seja", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 40, devolvidoHaDias: null, retirado: false },
    ]);

    const r = await previa(contrato.id).expect(200);
    expect(r.body.devida).toBe(false);
  });

  /**
   * O caso do extravio de verdade: a peça saiu e **nunca voltou**. Não há
   * evento nenhum para disparar a conta, então ela conta até HOJE — e é por
   * isso que a trilha é obrigatória nesta cobrança, e só nesta: o valor depende
   * do dia em que alguém clicou.
   */
  it("a peça que ainda está fora conta o atraso até HOJE", async () => {
    // Casamento há 30 dias → fim do uso há 28, e ela nunca voltou.
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 30, devolvidoHaDias: null },
    ]);

    const r = await previa(contrato.id).expect(200);
    expect(r.body.linhas[0].dias).toBe(28);
    expect(r.body.linhas[0].tipo).toBe("EXTRAVIO");
    expect(r.body.valor).toBe(12_000);
  });

  /**
   * A 16ª cobra sobre *"o valor do aluguel de cada peça"*. Sem a linha em
   * `contrato_itens` não há de onde tirá-lo, e a porta **diz isso** em vez de
   * inventar um número ou de responder `SEM_ATRASO` — que esconderia um defeito
   * de cadastro atrás de uma resposta tranquilizadora. Mesma escolha do E214
   * para o dano em peça fora de contrato.
   */
  it("peça atrasada fora do rol de itens: 422 que NOMEIA a peça, não um silêncio", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f);
    const casamento = diasAtras(10);
    const reserva = await criarReserva(f, { leadId: lead.id, casamentoData: casamento });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      reservaId: reserva.id,
      casamentoData: casamento,
      retiradaDataReal: diasAtras(13),
      devolucaoDataReal: diasAtras(5),
    });
    const contrato = await criarContrato(f, { leadId: lead.id, valorTotal: 3000, fechadoEm: new Date() });
    await db.insert(contratoBloqueiosTable).values({ contratoId: contrato.id, bloqueioId: bloqueio.id });
    // Sem `contrato_itens`: a peça está presa ao contrato e não está no rol.

    const r = await previa(contrato.id).expect(200);
    expect(r.body.devida).toBe(false);
    expect(r.body.semAluguel).toEqual([vestido.nome]);

    await cobrar(contrato.id).expect(422).expect((res) => {
      expect(res.body.error).toBe("ATRASO_SEM_ALUGUEL");
      expect(res.body.detalhe).toContain(vestido.nome);
    });
  });

  it("contrato cancelado não cobra atraso", async () => {
    const { contrato } = await noivaComPecas([{ aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 }]);
    await db.update(contratosTable).set({ status: "CANCELADO", canceladoEm: new Date() })
      .where(eq(contratosTable.id, contrato.id));

    await cobrar(contrato.id).expect(422).expect((res) => {
      expect(res.body.error).toBe("CONTRATO_NAO_ATIVO");
    });
  });

  it("contrato de outra loja é 404, não 403 com detalhe", async () => {
    await previa(randomUUID()).expect(404);
  });

  /**
   * A trilha não é decoração aqui. Esta é a única cobrança do sistema cujo
   * VALOR depende do dia do clique — a peça que não voltou soma uma diária por
   * dia. Sem a linha, "por que este atraso custou R$ 4.750,00?" não tem resposta
   * depois do fato, nem para a dona nem para a noiva que contestar.
   */
  it("a cobrança deixa rastro com a conta inteira, não só com o total", async () => {
    const { contrato } = await noivaComPecas([{ aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 }]);
    await cobrar(contrato.id).expect(201);

    const [linha] = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.entidadeId, contrato.id), eq(auditLogTable.acao, "ATRASO_COBRADO")));
    expect(linha).toBeDefined();
    const detalhe = linha!.detalhe as { valor: number; multa: number; linhas: { dias: number; diaria: number }[] };
    expect(detalhe.valor).toBe(1750);
    expect(detalhe.multa).toBe(250);
    expect(detalhe.linhas[0]!.diaria).toBe(500);
    expect(detalhe.linhas[0]!.dias).toBe(3);
  });
});
