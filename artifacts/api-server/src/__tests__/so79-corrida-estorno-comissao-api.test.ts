import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool, contratosTable, comissaoFechamentosTable } from "@workspace/db";
import {
  criarFixture,
  criarLead,
  criarContrato,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * S-O79 — **as três portas de `comissao.ts` trancam o contrato e releem a
 * guarda sob a tranca.** As corridas, reproduzidas de verdade.
 *
 * O E176 (S-O32) pôs `trancarContratos` nas três e parou aí; o E186 mediu que
 * a tranca chegava DEPOIS da pergunta, e a varredura marcava as três como
 * ABERTAS por isso — `releituraDaGuarda = null`. Trancar sem repreguntar não
 * decide nada: em READ COMMITTED, quem espera na fila acorda com a lista velha
 * na mão e escreve por cima da decisão de quem chegou primeiro.
 *
 * **A corrida aqui é determinística, não um sleep de sorte**, no molde do
 * `s33` (e do `sm7`): uma segunda conexão segura a linha com `FOR UPDATE`, a
 * rota fica pendurada na tranca, a conexão faz a escrita concorrente e só
 * então commita. A rota acorda com o lock na mão e a leitura velha na memória
 * — que é exatamente o instante que a releitura existe para cobrir.
 *
 * O `Test` do supertest é LAZY (só manda a request no `.then()`), e é por isso
 * que a request sai por `Promise.resolve(...)` antes do `setTimeout`: sem
 * isso, ela fica no papel e a corrida passa verde contra o código errado.
 */
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("S-O79 — a corrida das três portas do estorno de comissão", () => {
  afterAll(async () => {
    await fecharPool();
  });

  /**
   * O cenário do E54, em três gestos: regra de 10%, uma venda de R$ 10.000,00
   * paga na competência 2025-06 e o cancelamento dela depois do fechamento.
   * Sobra um estorno PENDENTE de R$ 10.000,00, que é o dinheiro em disputa nas
   * três corridas abaixo.
   */
  async function comEstornoPendente(f: Fixture) {
    const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
    await ag.post(`/api/lojas/${f.lojaId}/comissao/regras`).send({
      vendedoraId: f.vendedoraId,
      vigenciaInicio: dia("2020-01-01").toISOString(),
      faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
    }).expect(201);

    const lead = await criarLead(f);
    const contrato = await criarContrato(f, {
      leadId: lead.id,
      valorTotal: 10000,
      fechadoEm: dia("2025-06-10"),
    });
    await ag.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-06" }).expect(201);
    await ag
      .post(`/api/lojas/${f.lojaId}/contratos/${contrato.id}/cancelar`)
      .send({ motivo: "Desistência" })
      .expect(200);
    return { ag, contrato };
  }

  /** Uma venda de R$ 20.000,00 em 2025-07 — o mês que teria o que absorver. */
  async function vendaDeJulho(f: Fixture) {
    const lead = await criarLead(f);
    return criarContrato(f, { leadId: lead.id, valorTotal: 20000, fechadoEm: dia("2025-07-10") });
  }

  /**
   * A lista que ESTE fechamento reconciliou. Ela não viaja na resposta (o
   * `GerarComissaoFechamentoResponse` não a expõe) e é o campo que a reabertura
   * lê, então a conferência é no banco.
   */
  const reconciliadosPor = async (fechamentoId: string) => {
    const [linha] = await db
      .select({ ids: comissaoFechamentosTable.estornoContratoIds })
      .from(comissaoFechamentosTable)
      .where(eq(comissaoFechamentosTable.id, fechamentoId));
    return linha!.ids;
  };

  const estornoDoContrato = async (id: string) => {
    const [linha] = await db
      .select({
        estornadaEm: contratosTable.comissaoEstornadaEm,
        por: contratosTable.comissaoEstornoBaixaPor,
        motivo: contratosTable.comissaoEstornoBaixaMotivo,
      })
      .from(contratosTable)
      .where(eq(contratosTable.id, id));
    return linha!;
  };

  /**
   * Corrida 1 — **fechar a competência × baixar o estorno à mão.**
   *
   * Os dois leem o mesmo contrato como pendente. A baixa carimba com quem
   * baixou e por quê; o fechamento acordava e carimbava por cima, absorvendo
   * na base do mês R$ 10.000,00 que a dona já tinha dado como perdidos. Com
   * bruto de R$ 20.000,00 e faixa de 10%, a vendedora recebia **R$ 1.000,00 em
   * vez de R$ 2.000,00** — o mesmo estorno consumido duas vezes.
   */
  it("fechar a competência não absorve o estorno que uma baixa manual levou no intervalo", async () => {
    const f = await criarFixture();
    try {
      const { ag, contrato } = await comEstornoPendente(f);
      await vendaDeJulho(f);

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query("SELECT id FROM contratos WHERE id = $1 FOR UPDATE", [contrato.id]);

        // A rota calcula o pendente (vê R$ 10.000,00) e fica pendurada no
        // `trancarContratos`, que é a tranca desta mesma linha.
        const respostaP = Promise.resolve(
          ag.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-07" }),
        );
        await new Promise((r) => setTimeout(r, 300));

        // A baixa manual, feita pela conexão que segura a tranca.
        await cliente.query(
          `UPDATE contratos SET comissao_estornada_em = now(),
             comissao_estorno_baixa_por = $2, comissao_estorno_baixa_motivo = $3
           WHERE id = $1`,
          [contrato.id, f.superAdminId, "Acordo com a vendedora"],
        );
        await cliente.query("COMMIT");

        const resposta = await respostaP;
        expect(resposta.status).toBe(201);
        // A base do mês é a venda INTEIRA: o estorno já saiu por outra porta.
        expect(resposta.body[0].totalVendas).toBe(20000);
        expect(resposta.body[0].estornoAbsorvido).toBe(0);
        expect(resposta.body[0].valorTotal).toBe(2000);
        expect(await reconciliadosPor(resposta.body[0].id as string)).toEqual([]);
      } finally {
        cliente.release();
      }

      // E a decisão da dona sobreviveu inteira — antes, o carimbo do fechamento
      // ficava por cima e a data da baixa sumia.
      const linha = await estornoDoContrato(contrato.id);
      expect(linha.por).toBe(f.superAdminId);
      expect(linha.motivo).toBe("Acordo com a vendedora");
    } finally {
      await limparFixture(f);
    }
  });

  /**
   * Corrida 2 — **reabrir o mesmo fechamento duas vezes.**
   *
   * A lista de estornos saía de `fechamento.estornoContratoIds`, lido no POOL
   * antes da transação: os dois cliques liam a mesma linha e os dois entravam.
   * O segundo apagava zero linhas em silêncio, respondia **200** com
   * `estornosReabertos: 1` e devolvia `comissaoEstornadaEm` a NULL — num
   * contrato que, no intervalo, tinha recebido uma BAIXA MANUAL. O
   * `comissao_estorno_baixa_por` ficava, a data sumia, e os R$ 10.000,00
   * voltavam a descontar a vendedora no fechamento seguinte com a lista de
   * baixas dizendo que já tinham saído.
   */
  it("reabrir de novo o fechamento que outro já reabriu dá 404, e não desfaz a baixa manual", async () => {
    const f = await criarFixture();
    try {
      const { ag, contrato } = await comEstornoPendente(f);
      await vendaDeJulho(f);
      const criado = await ag
        .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-07" })
        .expect(201);
      const fechamentoId = criado.body[0].id as string;
      expect(await reconciliadosPor(fechamentoId)).toEqual([contrato.id]);

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query("SELECT id FROM comissao_fechamentos WHERE id = $1 FOR UPDATE", [fechamentoId]);

        // A rota lê o fechamento no pool, tranca a conta a pagar e fica
        // pendurada no DELETE da linha que esta conexão segura.
        const respostaP = Promise.resolve(ag.delete(`/api/lojas/${f.lojaId}/comissao/fechamentos/${fechamentoId}`));
        await new Promise((r) => setTimeout(r, 300));

        // O PRIMEIRO reabrir, inteiro, mais a baixa manual que veio depois dele.
        await cliente.query("DELETE FROM comissao_fechamentos WHERE id = $1", [fechamentoId]);
        await cliente.query("UPDATE contratos SET comissao_estornada_em = NULL WHERE id = $1", [contrato.id]);
        await cliente.query(
          `UPDATE contratos SET comissao_estornada_em = now(),
             comissao_estorno_baixa_por = $2, comissao_estorno_baixa_motivo = $3
           WHERE id = $1`,
          [contrato.id, f.superAdminId, "Acordo com a vendedora"],
        );
        await cliente.query("COMMIT");

        const resposta = await respostaP;
        expect(resposta.status).toBe(404);
        expect(resposta.body.error).toBe("FECHAMENTO_NAO_ENCONTRADO");
      } finally {
        cliente.release();
      }

      const linha = await estornoDoContrato(contrato.id);
      expect(linha.estornadaEm, "o segundo reabrir desfez a baixa manual").not.toBeNull();
      expect(linha.por).toBe(f.superAdminId);
      const [sumiu] = await db
        .select()
        .from(comissaoFechamentosTable)
        .where(eq(comissaoFechamentosTable.id, fechamentoId));
      expect(sumiu).toBeUndefined();
    } finally {
      await limparFixture(f);
    }
  });

  /**
   * Corrida 3 — **o espelho da primeira: baixar à mão × fechar a competência.**
   *
   * A baixa recalcula o pendente dentro da transação e trancava depois. Quando
   * um fechamento absorvia os mesmos contratos no intervalo, a baixa carimbava
   * por cima: a lista de baixas manuais passava a reivindicar um estorno que um
   * mês já tinha abatido, e a dona lia a mesma perda em dois relatórios.
   */
  it("baixar à mão o estorno que um fechamento absorveu no intervalo dá 422, e não recarimba", async () => {
    const f = await criarFixture();
    try {
      const { ag, contrato } = await comEstornoPendente(f);

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query("SELECT id FROM contratos WHERE id = $1 FOR UPDATE", [contrato.id]);

        const respostaP = Promise.resolve(
          ag
            .post(`/api/lojas/${f.lojaId}/comissao/estornos/baixa`)
            .send({ vendedoraId: f.vendedoraId, competencia: "2025-07", motivo: "Acordo com a vendedora" }),
        );
        await new Promise((r) => setTimeout(r, 300));

        // O fechamento concorrente absorve o estorno: carimba sem baixa manual.
        await cliente.query("UPDATE contratos SET comissao_estornada_em = now() WHERE id = $1", [contrato.id]);
        await cliente.query("COMMIT");

        const resposta = await respostaP;
        expect(resposta.status).toBe(422);
        expect(resposta.body.error).toBe("SEM_ESTORNO_PENDENTE");
      } finally {
        cliente.release();
      }

      // A reconciliação automática não vira baixa manual por acidente: quem
      // baixou e por quê continuam vazios, que é o que distingue as duas.
      const linha = await estornoDoContrato(contrato.id);
      expect(linha.estornadaEm).not.toBeNull();
      expect(linha.por, "a baixa carimbou por cima da reconciliação do mês").toBeNull();
      expect(linha.motivo).toBeNull();
    } finally {
      await limparFixture(f);
    }
  });
});
