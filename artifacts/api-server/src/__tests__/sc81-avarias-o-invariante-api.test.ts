import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, contratoItensTable, contratosTable } from "@workspace/db";
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
 * **S-C81/S-C82 — o cadastro da avaria, e o que de fato o segura.**
 *
 * ## S-C81: a sobra estava errada sobre a CONTA, e o conserto que ela propunha
 * compraria zero
 *
 * Ela dizia que *"o CADASTRO da avaria é a última grafia da conta fora do
 * servidor"* e que o conserto *"pede o `BloqueioVestido` carregar o aluguel"*.
 * Medido, as duas metades não se sustentam:
 *
 * 1. **A conta não está duplicada.** `avaliarTaxaDeAvaria` mora no
 *    `financeiro-core` e é chamada pelos dois lados — a tela e a porta usam a
 *    MESMA função. O que a tela acrescenta é escolher qual aluguel perguntar.
 *
 * 2. **A escolha do aluguel tem três grafias — e elas não podem divergir.**
 *    `contrato-ativo-da-noiva.ts` desempata pelo `fechadoEm` mais recente,
 *    `faixa-da-avaria.ts` faz `find` (o primeiro da lista) e o servidor pega o
 *    primeiro que o banco devolve, sem `ORDER BY`. Três regras diferentes para
 *    a mesma pergunta é o formato exato do E187 — e aqui elas **não** divergem,
 *    porque existe um índice **único parcial** garantindo no máximo um contrato
 *    ATIVO por noiva. Conferido no banco, não no comentário:
 *
 *    ```
 *    CREATE UNIQUE INDEX contratos_lead_ativo_unico ON contratos (lead_id)
 *      WHERE status = 'ATIVO'
 *    ```
 *
 * 3. **O conserto proposto custaria 9 operações por zero risco.**
 *    `BloqueioVestido` é devolvido por **9 rotas** (medido no `openapi.yaml`), a
 *    maioria delas listagens de calendário que não têm o que fazer com o teto de
 *    uma avaria. É a multiplicação do E215 (um campo virou 53 linhas) e da
 *    S-C240 (duas datas viraram dez), paga para eliminar uma divergência que o
 *    banco já impede.
 *
 * **O que faltava é isto:** cinco arquivos CITAM o índice em prosa e nenhum
 * prega que ele existe. Se ele cair, as três grafias divergem em silêncio e a
 * tela passa a anunciar um teto que a porta recusa — o defeito que o E187 achou,
 * com o mesmo mecanismo. A primeira cena abaixo é a régua do invariante.
 */
describe("S-C81 — o invariante que faz as três grafias do aluguel concordarem", () => {
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

  it("o índice único parcial de contrato ATIVO por noiva existe NO BANCO", async () => {
    // No banco, e não no schema: o `schema.ts` é a intenção, o `pg_indexes` é o
    // fato. Uma migração esquecida separa os dois, e é o formato da S-C150 —
    // guarda que depende de um gesto humano só protege depois do gesto.
    const { rows } = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'contratos_lead_ativo_unico'",
    );
    expect(
      rows,
      "o índice `contratos_lead_ativo_unico` sumiu. Sem ele uma noiva pode ter dois contratos " +
        "ATIVO, e as TRÊS grafias da escolha do aluguel (contrato-ativo-da-noiva, faixa-da-avaria " +
        "e aluguelDaPecaDoBloqueio) passam a poder responder coisas diferentes sobre o teto da " +
        "15ª — a tela anunciando o que a porta recusa (S-C81/E187).",
    ).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain("UNIQUE");
    expect(rows[0]!.indexdef).toContain("lead_id");
    expect(rows[0]!.indexdef).toContain("ATIVO");
  });

  it("o banco RECUSA o segundo contrato ativo da mesma noiva — o invariante morde", async () => {
    const lead = await criarLead(f);
    await criarContrato(f, { leadId: lead.id, valorTotal: 1000, fechadoEm: new Date() });

    // Direto no banco: é o invariante do BANCO que se prega aqui, não a guarda
    // da porta (que o E158 já tem e que tem cena própria).
    await expect(
      db.insert(contratosTable).values({
        id: randomUUID(),
        lojaId: f.lojaId,
        leadId: lead.id,
        vendedoraId: f.vendedoraId,
        valorTotal: 2000,
        fechadoEm: new Date(),
        status: "ATIVO",
      }),
    ).rejects.toThrow();
  });

  it("com um contrato ativo só, as três grafias respondem o MESMO aluguel", async () => {
    // A prova de que a concordância não é coincidência de implementação: o
    // teto que a porta usa é o que a tela derivaria do contrato ATIVO.
    const lead = await criarLead(f);
    const vestido = await criarVestido(f, { precoBase: 3000 });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(60),
    });
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 4200,
      fechadoEm: new Date(),
    });
    await db.insert(contratoItensTable).values({
      id: randomUUID(),
      lojaId: f.lojaId,
      contratoId: contrato.id,
      tipo: "VESTIDO",
      descricao: vestido.nome,
      quantidade: 1,
      valorUnitario: 4200,
      vestidoId: vestido.id,
    });

    const criada = await agent
      .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
      .send({ descricao: "Barra rasgada", custoReparo: 250, tipo: "DANO" })
      .expect(201);

    // O aluguel que a porta usou, no payload — e é o valor do item do contrato
    // ATIVO da dona do bloqueio, que é exatamente o que a tela derivaria.
    expect(criada.body.aluguelDaPeca).toBe(4200);
  });

/**
 * **S-C82 — a listagem pagava uma consulta por avaria.**
 *
 * `GET /bloqueios/:id/avarias` chamava `aluguelQueRegeAAvaria` dentro do
 * `map`, e essa função vai ao banco. As avarias desta rota são todas do MESMO
 * bloqueio, então a resposta só varia com uma coisa: o contrato que cobra o
 * reparo (ou `null`, quando não há cobrança viva). **Duas avarias sem cobrança
 * faziam a mesma consulta duas vezes.**
 *
 * A memoização é por REQUISIÇÃO e a chave é o que de fato distingue as
 * respostas. Não é cache: nasce e morre dentro da requisição, e por isso não
 * carrega o problema de invalidação que a S-C89 teve de resolver.
 *
 * A sobra dizia *"anotado para quando alguém listar avarias por LOJA"*. A
 * medição diz que já dói antes disso: **quatro avarias na ficha de uma peça já
 * são quatro consultas iguais** — não é preciso a listagem por loja nascer para
 * o custo existir.
 */
describe("S-C82 — a listagem de avarias não paga uma consulta por linha", () => {
  /** As tabelas que a listagem lê — sessão e permissão ficam de fora. */
  const TABELAS = /\b(avarias|parcelas|bloqueio_vestidos|contratos|contrato_itens|reservas)\b/;

  it("quatro avarias sem cobrança custam UMA consulta de aluguel, não quatro", async () => {
    const lead = await criarLead(f);
    const vestido = await criarVestido(f, { precoBase: 3000 });
    const bloqueio = await criarBloqueio(f, {
      tipo: "RESERVA_CASAMENTO",
      vestidoId: vestido.id,
      leadId: lead.id,
      casamentoData: dataFutura(60),
    });
    for (const n of [1, 2, 3, 4]) {
      await agent
        .post(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .send({ descricao: `Avaria ${n}`, custoReparo: 100, tipo: "DANO" })
        .expect(201);
    }

    const original = pool.query.bind(pool) as typeof pool.query;
    let n = 0;
    (pool as { query: typeof pool.query }).query = ((...args: unknown[]) => {
      const primeiro = args[0] as string | { text?: string } | undefined;
      const texto = typeof primeiro === "string" ? primeiro : (primeiro?.text ?? "");
      if (TABELAS.test(texto)) n += 1;
      return (original as unknown as (...a: unknown[]) => unknown)(...args);
    }) as unknown as typeof pool.query;

    try {
      const r = await agent
        .get(`/api/lojas/${f.lojaId}/bloqueios/${bloqueio.id}/avarias`)
        .expect(200);
      expect(r.body).toHaveLength(4);
      /**
       * A conta, por extenso (igualdade — piso `<=` deixa a prosa envelhecer):
       * avarias+parcela(1) + bloqueio da lista(1) + o aluguel **uma vez para as
       * quatro** (1) = **3**.
       *
       * **Antes eram 6, medido**: a última repetia por avaria
       * (`expected 6 to be 3`). Nesta cena a noiva não tem contrato ativo, e é
       * por isso que a consulta do aluguel para cedo — com contrato ativo cada
       * volta custaria três, e a queda seria de 14 para 5. O número aqui é o da
       * cena; o que a régua trava é que ele **não cresce com o número de
       * avarias**.
       *
       * Quem mudar a rota e vir este número cair, ganhou; subir, explica.
       */
      expect(n).toBe(3);
    } finally {
      (pool as { query: typeof pool.query }).query = original;
    }
  });
});
});
