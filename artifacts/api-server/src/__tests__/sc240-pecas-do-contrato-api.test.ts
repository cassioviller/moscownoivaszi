import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { relogio } from "../lib/relogio";
import { diaDaSemana, diaLocal } from "@workspace/financeiro-core";
import {
  criarBloqueio,
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  criarVestido,
  dataFutura,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **S-C240 — o contrato passa a dizer QUAIS peças ele prende.**
 *
 * A sobra dizia que `contratos/[id].tsx` tem *"zero ocorrências de
 * 'bloqueio'/'reserva'"*. Medido: **tem nove** — e nenhuma delas é a peça. São
 * todas a **reserva de 40% da cláusula 8ª §1º** (E218) e o prazo da 18ª. A
 * palavra estava lá significando outra coisa, que é exatamente por que um
 * `grep -c` engana: a substância da sobra estava certa e a medida dela não.
 *
 * O que faltava: a resposta trazia `bloqueioVestidoIds` desde o E72 — ids
 * crus, que não desenham nada. A tela não tinha como dizer QUAL vestido está
 * preso, e o caminho para a peça física era sempre pela ficha dela. **Foi o
 * E223 que tornou isso caro**, ao pôr a porta de TROCA na ficha da peça: o
 * gesto que a cláusula 17ª dá ao contrato passou a morar numa tela a que o
 * contrato não levava.
 *
 * A porta ganhou `pecas` — a mesma reserva, com nome, código e as datas reais
 * —, e a tela ganhou o card com o link para a ficha. **Só as VIVAS**: a régua é
 * a de `montarVestidoDaNoiva`, e mostrar reserva cancelada prometeria um
 * vestido que a loja já liberou para outra noiva.
 */
describe("S-C240 — GET /contratos/:id diz quais peças o contrato prende", () => {
  let f: Fixture;
  let agent: Awaited<ReturnType<typeof loginComLoja>>;

  beforeAll(async () => {
    f = await criarFixture();
    agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
    let quarta = new Date();
    while (diaDaSemana(diaLocal(quarta)) !== 3) quarta = new Date(quarta.getTime() + 86_400_000);
    vi.spyOn(relogio, "agora").mockReturnValue(quarta);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await limparFixture(f);
    await fecharPool();
  });

  async function vendaFechada() {
    const lead = await criarLead(f);
    const vestidoA = await criarVestido(f);
    const bloqueioA = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestidoA.id,
      leadId: lead.id,
      casamentoData: dataFutura(90),
    });
    const orcamento = await criarOrcamento(f, { leadId: lead.id });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "VESTIDO",
      descricao: vestidoA.nome,
      valorUnitario: 5000,
      vestidoId: vestidoA.id,
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId: orcamento.id,
        valorTotal: 5000,
        bloqueioVestidoIds: [bloqueioA.id],
      })
      .expect(201);
    return { vestidoA, bloqueioA, contratoId: criado.body.id as string };
  }

  it("a peça vem com nome e endereço — o id cru não desenhava nada", async () => {
    const { vestidoA, bloqueioA, contratoId } = await vendaFechada();

    const r = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}`).expect(200);

    expect(r.body.pecas).toHaveLength(1);
    expect(r.body.pecas[0]).toMatchObject({
      bloqueioId: bloqueioA.id,
      vestidoId: vestidoA.id,
      nome: vestidoA.nome,
    });
    // A peça não saiu: as datas reais são nulas, e é o que a tela usa para
    // dizer "na loja" em vez de inventar um estado.
    expect(r.body.pecas[0].retiradaFeitaEm).toBeNull();
    expect(r.body.pecas[0].devolucaoFeitaEm).toBeNull();
  });

  it("depois da troca, a lista diz a peça NOVA — a cancelada não é peça deste contrato", async () => {
    const { vestidoA, bloqueioA, contratoId } = await vendaFechada();
    const vestidoB = await criarVestido(f, { precoBase: 7000 });

    await agent
      .post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/trocar-peca`)
      .send({ bloqueioId: bloqueioA.id, vestidoNovoId: vestidoB.id })
      .expect(200);

    const r = await agent.get(`/api/lojas/${f.lojaId}/contratos/${contratoId}`).expect(200);

    // Uma peça, e é a nova. Sem o filtro de `canceladoEm` viriam as duas — e a
    // tela ofereceria "abrir a reserva" de uma peça que a loja já liberou.
    expect(r.body.pecas.map((p: { nome: string }) => p.nome)).toEqual([vestidoB.nome]);
    expect(r.body.pecas.map((p: { nome: string }) => p.nome)).not.toContain(vestidoA.nome);
  });

  it("contrato sem peça de acervo devolve lista vazia, não erro", async () => {
    // O contrato só de serviço existe, e a tela diz isso em vez de sumir.
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id });
    await criarOrcamentoItem(f, {
      orcamentoId: orcamento.id,
      tipo: "SERVICO",
      descricao: "Ajuste de barra",
      valorUnitario: 200,
    });
    const criado = await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        orcamentoId: orcamento.id,
        valorTotal: 200,
      })
      .expect(201);

    const r = await agent
      .get(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}`)
      .expect(200);
    expect(r.body.pecas).toEqual([]);
  });
});
