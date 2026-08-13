import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contratoBloqueiosTable, contratoItensTable, contratosTable, db } from "@workspace/db";
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
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **S-C32 — o atraso tem FILA, porque ausência não notifica ninguém.**
 *
 * O E212 fez o sistema cobrar a 16ª e deu à conta uma porta só: a ficha daquela
 * reserva. O fato que a dispara, porém, **não é um gesto** — o reajuste do E211
 * nasce quando alguém move a data, a avaria nasce quando alguém confere a peça,
 * e aqui ninguém faz nada. A peça simplesmente não volta.
 *
 * Medido antes de escrever: `ATRASO_DEVOLUCAO` aparecia em **um único sítio**
 * de `moscow-noivas/src` — e era o comentário que o próprio E212 escreveu. Quem
 * não abrisse aquela ficha específica não sabia que a peça estava fora, e a
 * diária de **R$ 500,00** (aluguel de R$ 3.000,00 ÷ 6 dias de janela) somava
 * sozinha todo dia.
 *
 * Este arquivo prega a varredura. A conta em si é do E212 e continua pregada
 * lá — se ela mudar, os dois arquivos caem, e é o que se quer: a fila mostra o
 * número que a ficha vai cobrar.
 */
describe("S-C32 — a fila das peças que não voltaram no prazo", () => {
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

  /** A mesma montagem do E212: vestido + bloqueio com datas reais + rol de itens. */
  async function noivaComPecas(
    pecas: {
      aluguel: number | null;
      casamentoHaDias: number;
      devolvidoHaDias?: number | null;
      retirado?: boolean;
    }[],
  ) {
    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: pecas.reduce((s, p) => s + (p.aluguel ?? 0), 0),
      fechadoEm: new Date(),
    });
    const nomes: string[] = [];
    const bloqueios: string[] = [];
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
      // `aluguel: null` é a peça FORA do rol de itens — a que atrasou e que a
      // 16ª não sabe cobrar.
      if (p.aluguel !== null) {
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
      }
      nomes[i] = vestido.nome;
      bloqueios[i] = bloqueio.id;
    }
    return { lead, contrato, nomes, bloqueios };
  }

  const fila = () => agent.get(`/api/lojas/${f.lojaId}/contratos-com-atraso`);

  /** O que a porta devolve por contrato — escrito à mão para o typecheck ler. */
  type ItemDaFila = {
    contratoId: string;
    leadId: string;
    noivaNome: string | null;
    bloqueioId: string;
    linhas: { descricao: string; tipo: string; dias: number; diaria: number; valor: number }[];
    multa: number;
    valor: number;
    temExtravio: boolean;
    maiorAtraso: number;
    explicacao: string | null;
    semAluguel: string[];
    jaCobrada: boolean;
  };

  /** A linha DESTE contrato dentro da fila da loja — os testes convivem no mesmo banco. */
  async function linhaDe(contratoId: string) {
    const r = await fila().expect(200);
    return {
      corpo: r.body as { itens: ItemDaFila[]; pecas: number; valor: number },
      item: (r.body.itens as ItemDaFila[]).find((i) => i.contratoId === contratoId),
    };
  }

  it("a loja sem peça fora do prazo tem fila vazia — e vazia não é erro", async () => {
    const r = await fila().expect(200);
    expect(r.body.itens).toEqual([]);
    expect(r.body.pecas).toBe(0);
    expect(r.body.valor).toBe(0);
  });

  /**
   * O caso canônico do E212, agora visto de fora da ficha: casamento há 10 dias
   * → fim do uso previsto há 8; devolvida há 5 = **3 dias** de atraso.
   * 3 × R$ 500,00 + R$ 250,00 de multa = **R$ 1.750,00**.
   */
  it("a peça devolvida com atraso entra na fila com a conta do E212, não com outra", async () => {
    const { contrato, nomes, bloqueios } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 },
    ]);

    const { item } = await linhaDe(contrato.id);
    expect(item).toBeDefined();
    expect(item!.maiorAtraso).toBe(3);
    expect(item!.valor).toBe(1750);
    expect(item!.multa).toBe(250);
    expect(item!.linhas).toHaveLength(1);
    expect(item!.linhas[0].descricao).toBe(nomes[0]);
    expect(item!.linhas[0].diaria).toBe(500);
    expect(item!.temExtravio).toBe(false);
    expect(item!.jaCobrada).toBe(false);
    // A ficha por onde se cobra — sem ela a fila avisa e não leva a lugar nenhum.
    expect(item!.bloqueioId).toBe(bloqueios[0]);
    expect(item!.noivaNome).toBeTruthy();
  });

  /**
   * **A fila e a ficha não podem divergir**, e é por isso que a varredura chama
   * a MESMA função da prévia em vez de recalcular por fora (lição do E187: eram
   * cinco grafias da mesma conta de desconto, e duas erravam).
   */
  it("o número da fila é, campo a campo, o da prévia daquele contrato", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 20, devolvidoHaDias: 6 },
    ]);

    const { item } = await linhaDe(contrato.id);
    const previa = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
      .expect(200);

    expect(item!.valor).toBe(previa.body.valor);
    expect(item!.multa).toBe(previa.body.multa);
    expect(item!.maiorAtraso).toBe(previa.body.maiorAtraso);
    expect(item!.temExtravio).toBe(previa.body.temExtravio);
    expect(item!.explicacao).toBe(previa.body.explicacao);
    expect(item!.linhas).toEqual(previa.body.linhas);
    // 12 dias é o caput: 4 × R$ 3.000,00, e SEM a multa que ele não menciona.
    expect(item!.valor).toBe(12_000);
    expect(item!.multa).toBe(0);
  });

  /**
   * **É esta a linha que a S-C32 existe para acender.** A peça saiu e nunca
   * voltou: não há evento nenhum para disparar a conta, e o número cresce
   * sozinho — R$ 500,00 por dia — até alguém olhar. A fila é o "alguém olhar".
   */
  it("a peça que ainda está fora aparece na fila contando até HOJE", async () => {
    // Casamento há 9 dias → fim do uso há 7, e ela nunca voltou: 7 dias.
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 9, devolvidoHaDias: null },
    ]);

    const { item } = await linhaDe(contrato.id);
    expect(item!.maiorAtraso).toBe(7);
    // 7 × R$ 500,00 + R$ 250,00.
    expect(item!.valor).toBe(3750);
    expect(item!.linhas[0].tipo).toBe("ATRASO");
  });

  it("a peça devolvida no prazo não põe o contrato na fila", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 8 },
    ]);
    const { item } = await linhaDe(contrato.id);
    expect(item).toBeUndefined();
  });

  it("a peça que nunca foi retirada não põe o contrato na fila, por mais antiga que seja", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 60, devolvidoHaDias: null, retirado: false },
    ]);
    const { item } = await linhaDe(contrato.id);
    expect(item).toBeUndefined();
  });

  /**
   * A peça atrasada FORA do rol de itens não tem conta (`ATRASO_SEM_ALUGUEL`,
   * 422) — e é a que mais precisa ser vista: ela está fora e **ninguém consegue
   * cobrá-la**. Calá-la aqui esconderia um defeito de cadastro atrás de uma
   * fila vazia, que é a resposta tranquilizadora que o E212 recusou na porta.
   */
  it("a peça fora do rol de itens entra na fila sem conta, e nomeada", async () => {
    const { contrato, nomes } = await noivaComPecas([
      { aluguel: null, casamentoHaDias: 10, devolvidoHaDias: 5 },
    ]);

    const { item } = await linhaDe(contrato.id);
    expect(item).toBeDefined();
    expect(item!.valor).toBe(0);
    expect(item!.linhas).toEqual([]);
    expect(item!.semAluguel).toEqual([nomes[0]]);
    // O atraso é real mesmo sem conta: a fila diz há quantos dias.
    expect(item!.maiorAtraso).toBe(3);
  });

  /**
   * §2º — três peças atrasadas são UMA linha na fila (uma parcela, uma multa) e
   * **três peças** na contagem: são três araras vazias.
   */
  it("três peças da mesma noiva são uma linha na fila e três na contagem de peças", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 6 },
      { aluguel: 400, casamentoHaDias: 10, devolvidoHaDias: 6 },
      { aluguel: 200, casamentoHaDias: 10, devolvidoHaDias: 6 },
    ]);

    const { item } = await linhaDe(contrato.id);
    expect(item!.linhas).toHaveLength(3);
    expect(item!.multa).toBe(250);
    // 2 dias × (500,00 + 66,67 + 33,33) = 1.200,00, mais a multa.
    expect(item!.valor).toBe(1450);
  });

  it("o contrato CANCELADO sai da fila — a porta não o cobraria", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 },
    ]);
    expect((await linhaDe(contrato.id)).item).toBeDefined();

    await db
      .update(contratosTable)
      .set({ status: "CANCELADO", canceladoEm: new Date() })
      .where(eq(contratosTable.id, contrato.id));

    expect((await linhaDe(contrato.id)).item).toBeUndefined();
  });

  /**
   * V2/E167 aplicado à fila: cobrado o atraso, a linha **continua** — a peça
   * segue fora da arara, e sumir da fila diria que voltou. O que muda é o selo.
   */
  it("cobrar o atraso não tira a linha da fila: marca `jaCobrada`", async () => {
    const { contrato } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 10, devolvidoHaDias: 5 },
    ]);

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cobranca-de-atraso`)
      .send({})
      .expect(201);

    const { item } = await linhaDe(contrato.id);
    expect(item).toBeDefined();
    expect(item!.jaCobrada).toBe(true);
  });

  /** A fila vem do maior atraso ao menor: é o que espera há mais tempo. */
  it("a fila ordena pelo maior atraso, e soma peças e dinheiro da loja", async () => {
    const antes = await fila().expect(200);
    const { contrato: velho } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 40, devolvidoHaDias: null },
    ]);
    const { contrato: novo } = await noivaComPecas([
      { aluguel: 3000, casamentoHaDias: 11, devolvidoHaDias: null },
    ]);

    const r = await fila().expect(200);
    const dias = (r.body.itens as { maiorAtraso: number }[]).map((i) => i.maiorAtraso);
    expect([...dias]).toEqual([...dias].sort((a, b) => b - a));

    const ids = (r.body.itens as { contratoId: string }[]).map((i) => i.contratoId);
    expect(ids.indexOf(velho.id)).toBeLessThan(ids.indexOf(novo.id));

    // O total é a SOMA do que a régua devolveu, não uma segunda conta.
    const soma = (r.body.itens as { valor: number }[]).reduce((s, i) => s + i.valor, 0);
    expect(r.body.valor).toBe(soma);
    expect(r.body.pecas).toBeGreaterThan(antes.body.pecas);
  });

  /**
   * **O gate, e ele é a decisão do épico.** A fila irmã em forma é a cobrança
   * (`/financeiro/cobranca`), gateada por `financeiro` — e a **Vendedora do
   * seed tem `financeiro: NADA` e `contratos: TUDO`**
   * (`configuracao-inicial.ts:147`). A fixture descreve exatamente esse perfil:
   * se a fila morasse no financeiro, quem pode cobrar o atraso nunca a veria.
   */
  it("a vendedora sem `financeiro` alcança a fila — é `contratos` que manda", async () => {
    const vendedora = await loginComLoja(f.vendedoraEmail, f.lojaId);
    await vendedora.get(`/api/lojas/${f.lojaId}/contratos-com-atraso`).expect(200);
    // E a mesma sessão NÃO alcança o financeiro, que é o gate da fila irmã.
    await vendedora.get(`/api/lojas/${f.lojaId}/financeiro/fluxo`).expect(403);
  });

  it("a fila de outra loja não vaza para esta", async () => {
    await agent.get(`/api/lojas/${randomUUID()}/contratos-com-atraso`).expect(403);
  });
});
