import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, orcamentosTable, orcamentoVersoesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  criarFixture,
  criarLead,
  criarOrcamento,
  criarOrcamentoItem,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * E180 / S-O15 — **as duas portas que congelam versão fazem o MESMO gesto.**
 *
 * Congelar uma versão é o que garante que a noiva assine o que viu, e há duas
 * portas que o fazem: o `POST /orcamentos/:id/link` (compartilhar É enviar) e o
 * `PATCH /orcamentos/:id` que marca ENVIADO. Elas cobravam pré-condições
 * diferentes, cada uma escrita no seu lugar:
 *
 * | | `POST /link` | `PATCH` ENVIADO (antes) |
 * |---|---|---|
 * | exige ≥1 item | sim, **sob a tranca** | sim, **lido no POOL** |
 * | reabre validade vencida (D3) | sim | **não** |
 *
 * A sobra dizia *"hoje não produz defeito — quem reenvia passa pelo link"*, e a
 * releitura da regra 20 desmentiu a metade otimista: **produz, e chega à
 * noiva.** Um RASCUNHO de 40 dias marcado como ENVIADO congelava uma versão já
 * VENCIDA, e a página dela respondia 422 `VALIDADE_VENCIDA` no aceite — a
 * proposta nascia morta pela porta B e nascia viva pela porta A, no mesmo
 * orçamento.
 */
describe("E180 — o congelamento tem uma régua só", () => {
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

  /** Um RASCUNHO com item e a validade já no passado — o caso de 40 dias. */
  async function rascunhoVencido() {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });
    await db
      .update(orcamentosTable)
      .set({ validade: new Date("2026-07-10T12:00:00Z") })
      .where(eq(orcamentosTable.id, orcamento.id));
    return orcamento;
  }

  it("marcar como ENVIADO reabre a validade vencida — como o link sempre fez", async () => {
    const orcamento = await rascunhoVencido();

    /**
     * VERMELHO ANTES: a validade continuava em **2026-07-10** e a versão
     * congelada saía com ela dentro —
     * `expected 1752148800000 to be greater than 1755000000000`. A noiva abria
     * a página, via a proposta certa, clicava em Aceitar e levava 422
     * `VALIDADE_VENCIDA`; a vendedora não tinha o que fazer na tela, porque
     * quem reabre é a OUTRA porta.
     */
    const r = await agent
      .patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`)
      .send({ status: "ENVIADO" })
      .expect(200);

    const [depois] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(depois!.validade!.getTime()).toBeGreaterThan(Date.now());
    // A resposta da rota conta o mesmo que o banco: a tela não precisa recarregar
    // para saber até quando a proposta vale.
    expect(new Date(r.body.validade).getTime()).toBe(depois!.validade!.getTime());

    /** E o que congelou carrega a validade NOVA — a noiva aceita o prazo que lê. */
    const [versao] = await db
      .select()
      .from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
      .orderBy(desc(orcamentoVersoesTable.numero));
    expect(versao!.validade!.getTime()).toBe(depois!.validade!.getTime());
  });

  it("e as duas portas chegam ao MESMO estado — é o que 'uma régua só' quer dizer", async () => {
    const pelaPorta = async (enviar: (id: string) => Promise<unknown>) => {
      const o = await rascunhoVencido();
      await enviar(o.id);
      const [linha] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, o.id));
      const versoes = await db
        .select()
        .from(orcamentoVersoesTable)
        .where(eq(orcamentoVersoesTable.orcamentoId, o.id));
      return {
        status: linha!.status,
        validadeFutura: linha!.validade!.getTime() > Date.now(),
        versoes: versoes.length,
        versaoBateComALinha: versoes[0]!.validade!.getTime() === linha!.validade!.getTime(),
      };
    };

    const porLink = await pelaPorta((id) =>
      agent.post(`/api/lojas/${f.lojaId}/orcamentos/${id}/link`).expect(200),
    );
    const porPatch = await pelaPorta((id) =>
      agent.patch(`/api/lojas/${f.lojaId}/orcamentos/${id}`).send({ status: "ENVIADO" }).expect(200),
    );

    expect(porLink).toEqual({ status: "ENVIADO", validadeFutura: true, versoes: 1, versaoBateComALinha: true });
    expect(porPatch).toEqual(porLink);
  });

  /**
   * A outra metade da divergência: o `PATCH` perguntava "tem item?" no POOL,
   * fora da transação (`orcamentos.ts:718`). É a forma da S-O31 uma camada
   * abaixo — a guarda decide com o valor velho e o congelamento acontece
   * assim mesmo.
   *
   * A guarda do pool FICA: ela dá o 422 sem custo de transação para o caminho
   * comum. O que muda é que ela deixou de ser a última palavra.
   */
  it("o último item removido ENTRE a guarda e a tranca ainda recusa — a corrida, de verdade", async () => {
    const lead = await criarLead(f);
    const orcamento = await criarOrcamento(f, { leadId: lead.id, status: "RASCUNHO" });
    await criarOrcamentoItem(f, { orcamentoId: orcamento.id, valorUnitario: 5000 });

    /**
     * A corrida é determinística, no molde do `s33-corrida-delete-loja`: uma
     * segunda conexão segura a linha do orçamento com `FOR UPDATE`, a rota lê a
     * guarda no POOL (vê o item), fica pendurada na tranca, e só então o item
     * some e o commit a solta.
     *
     * O `Test` do supertest é LAZY — a request só sai no `.then()` —, e por
     * isso o `Promise.resolve` está aqui: guardar a variável deixaria a request
     * no papel e o teste passaria até sobre o código sem o conserto.
     *
     * VERMELHO ANTES: **200** — o orçamento ia a ENVIADO e congelava a versão 1
     * com `totalLiquido: 0` e hash do vazio, que é o beco do O1 (E166) entrando
     * pela porta que o E166 não fechou: lá a pergunta foi para dentro da tranca
     * no `POST /link`, e aqui ela ficou no pool.
     */
    const cliente = await pool.connect();
    let resposta;
    try {
      await cliente.query("BEGIN");
      await cliente.query("SELECT id FROM orcamentos WHERE id = $1 FOR UPDATE", [orcamento.id]);

      const respostaP = Promise.resolve(
        agent.patch(`/api/lojas/${f.lojaId}/orcamentos/${orcamento.id}`).send({ status: "ENVIADO" }),
      );
      await new Promise((r) => setTimeout(r, 300));
      await cliente.query("DELETE FROM orcamento_itens WHERE orcamento_id = $1", [orcamento.id]);
      await cliente.query("COMMIT");

      resposta = await respostaP;
    } finally {
      cliente.release();
    }

    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toBe("ORCAMENTO_VAZIO");

    // E nada ficou pela metade: sem versão congelada e sem a marca de ENVIADO.
    const versoes = await db
      .select()
      .from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id));
    expect(versoes).toHaveLength(0);
    const [linha] = await db.select().from(orcamentosTable).where(eq(orcamentosTable.id, orcamento.id));
    expect(linha!.status).toBe("RASCUNHO");
  });
});
