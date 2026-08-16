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
 * E238 — **o fechamento de comissão faz fila com o reabrir, e não decide sobre
 * uma linha que outro está apagando.**
 *
 * A S-O79 (E191) trancou o CONTRATO e releu o carimbo sob a tranca. Sobraram
 * duas leituras de `comissao_fechamentos` — a tabela que o reabrir APAGA — que
 * o `POST /comissao/fechamentos` fazia sem segurar nada, e as duas estão
 * reproduzidas aqui como corrida determinística, no molde do `so79`: uma
 * segunda conexão faz o gesto do reabrir (o DELETE) e NÃO commita; a rota
 * entra; a conexão commita; a rota responde.
 *
 * Sem a tranca, a rota não espera ninguém: lê a linha ainda visível (READ
 * COMMITTED não enxerga o DELETE por commitar), decide, e responde ANTES do
 * commit — a espera de 500 ms é o que garante que ela terminou antes de a
 * conexão soltar. Com a tranca (`FOR UPDATE` nas linhas de fechamento das
 * vendedoras em jogo), a rota fica pendurada na linha que o DELETE segura,
 * acorda depois do commit, e o `FOR UPDATE` do Postgres pula a linha que
 * deixou de existir: a decisão sai do estado NOVO.
 */
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe("E238 — reabrir × fechar, no mesmo segundo", () => {
  afterAll(async () => {
    await fecharPool();
  });

  async function comRegraDe10PorCento(f: Fixture) {
    const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
    await ag.post(`/api/lojas/${f.lojaId}/comissao/regras`).send({
      vendedoraId: f.vendedoraId,
      vigenciaInicio: dia("2020-01-01").toISOString(),
      faixas: [{ minAcumulado: 0, maxAcumulado: null, percentual: 10 }],
    }).expect(201);
    return ag;
  }

  async function venda(f: Fixture, valorTotal: number, fechadoEm: string) {
    const lead = await criarLead(f);
    return criarContrato(f, { leadId: lead.id, valorTotal, fechadoEm: dia(fechadoEm) });
  }

  const fechamentoDe = async (fechamentoId: string) => {
    const [linha] = await db
      .select({
        contaPagarId: comissaoFechamentosTable.contaPagarId,
        estornoAbsorvido: comissaoFechamentosTable.estornoAbsorvido,
        ids: comissaoFechamentosTable.estornoContratoIds,
      })
      .from(comissaoFechamentosTable)
      .where(eq(comissaoFechamentosTable.id, fechamentoId));
    return linha;
  };

  /** O gesto do reabrir, cru, na conexão que segura a transação aberta. */
  async function reabrirSemCommitar(cliente: { query: (q: string, p?: unknown[]) => Promise<unknown> }, fechamentoId: string) {
    const linha = await fechamentoDe(fechamentoId);
    await cliente.query("DELETE FROM comissao_fechamentos WHERE id = $1", [fechamentoId]);
    if (linha?.contaPagarId) {
      await cliente.query("DELETE FROM contas_pagar WHERE id = $1", [linha.contaPagarId]);
    }
  }

  /**
   * S-O107 — **fechar logo depois de reabrir dizia que já estava fechado.**
   *
   * `jaFechadas` saía de um `select` sem tranca. Com o DELETE do reabrir ainda
   * por commitar, a rota contava a vendedora como fechada, não fechava ninguém
   * e respondia 409 sobre uma competência que voltou a estar aberta — a dona
   * ouvia "já foram fechadas" um segundo depois de reabrir. Não custa dinheiro
   * (a UNIQUE segura o pagamento em dobro); custa uma recusa que ninguém
   * consegue explicar. Medido no `main` antes do conserto:
   * `expected 409 to be 201`.
   */
  it("fechar a competência que outro está reabrindo espera o reabrir e fecha (S-O107)", async () => {
    const f = await criarFixture();
    try {
      const ag = await comRegraDe10PorCento(f);
      await venda(f, 10000, "2025-07-10");
      const primeiro = await ag
        .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-07" })
        .expect(201);
      const fechamentoId = primeiro.body[0].id as string;

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await reabrirSemCommitar(cliente, fechamentoId);

        // A dona clica em "Fechar competência" com o reabrir ainda no ar.
        const respostaP = Promise.resolve(
          ag.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-07" }),
        );
        // E247 (G8): a prova de que a rota ESPEROU — sob máquina carregada, o sleep
        // sozinho fica verde sem tranca nenhuma. A resposta NÃO pode ter chegado
        // antes do COMMIT.
        let chegou_respostaP = false;
        void respostaP.then(() => { chegou_respostaP = true; }, () => { chegou_respostaP = true; });
        await new Promise((r) => setTimeout(r, 500));
        expect(chegou_respostaP, "a rota respondeu ANTES do commit — não esperou a tranca").toBe(false);
        await cliente.query("COMMIT");

        const resposta = await respostaP;
        expect(resposta.status, JSON.stringify(resposta.body)).toBe(201);
        expect(resposta.body).toHaveLength(1);
        expect(resposta.body[0].vendedoraId).toBe(f.vendedoraId);
        expect(resposta.body[0].totalVendas).toBe(10000);
        expect(resposta.body[0].valorTotal).toBe(1000);
      } finally {
        cliente.release();
      }

      // Uma linha só para a competência: a do fechamento novo.
      const linhas = await db
        .select({ id: comissaoFechamentosTable.id })
        .from(comissaoFechamentosTable)
        .where(eq(comissaoFechamentosTable.lojaId, f.lojaId));
      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.id).not.toBe(fechamentoId);
    } finally {
      await limparFixture(f);
    }
  });

  /**
   * S-O106 — **o pendente carregava a absorção de um parcial que já tinha sido
   * reaberto, e a releitura da S-O79 não alcançava.**
   *
   * A cena: venda de R$ 10.000,00 em 2025-06, fechada e cancelada depois —
   * R$ 10.000,00 de estorno pendente. Venda de R$ 4.000,00 em 2025-07, fechada:
   * o mês absorve o que cabe (R$ 4.000,00), não carimba o contrato
   * (`estornoContratoIds` vazio, E102/C5) e o pendente cai para R$ 6.000,00.
   * Venda de R$ 20.000,00 em 2025-08.
   *
   * Reabrir 07 devolve os R$ 4.000,00 ao pendente APAGANDO a linha — e o
   * reabrir de um parcial não tranca contrato nenhum, porque a lista dele é
   * vazia. Se o fechamento de 08 lê os fechamentos antes de o DELETE commitar,
   * ele carrega R$ 6.000,00, tranca o contrato (livre), relê o carimbo (ainda
   * pendente, correto) e absorve R$ 6.000,00: base de **R$ 14.000,00**, contrato
   * carimbado como reconciliado, e os R$ 4.000,00 do parcial que voltou ficam
   * sem dono — a loja paga R$ 1.400,00 por R$ 1.000,00 devidos. Medido no
   * `main` antes do conserto: `expected 14000 to be 10000`.
   */
  it("fechar 2025-08 enquanto reabrem o parcial de 2025-07 absorve o estorno INTEIRO (S-O106)", async () => {
    const f = await criarFixture();
    try {
      const ag = await comRegraDe10PorCento(f);
      const cancelado = await venda(f, 10000, "2025-06-10");
      await ag.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-06" }).expect(201);
      await ag
        .post(`/api/lojas/${f.lojaId}/contratos/${cancelado.id}/cancelar`)
        .send({ motivo: "Desistência" })
        .expect(200);

      await venda(f, 4000, "2025-07-10");
      const parcial = await ag
        .post(`/api/lojas/${f.lojaId}/comissao/fechamentos`)
        .send({ competencia: "2025-07" })
        .expect(201);
      const parcialId = parcial.body[0].id as string;
      // A premissa da cena: 07 absorveu R$ 4.000,00 sem carimbar o contrato.
      expect(parcial.body[0].totalVendas).toBe(0);
      expect(parcial.body[0].estornoAbsorvido).toBe(4000);
      expect((await fechamentoDe(parcialId))!.ids).toEqual([]);

      await venda(f, 20000, "2025-08-10");

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await reabrirSemCommitar(cliente, parcialId);

        const respostaP = Promise.resolve(
          ag.post(`/api/lojas/${f.lojaId}/comissao/fechamentos`).send({ competencia: "2025-08" }),
        );
        // E247 (G8): a mesma prova de espera da cena acima.
        let chegou_respostaP = false;
        void respostaP.then(() => { chegou_respostaP = true; }, () => { chegou_respostaP = true; });
        await new Promise((r) => setTimeout(r, 500));
        expect(chegou_respostaP, "a rota respondeu ANTES do commit — não esperou a tranca").toBe(false);
        await cliente.query("COMMIT");

        const resposta = await respostaP;
        expect(resposta.status, JSON.stringify(resposta.body)).toBe(201);
        // O pendente é R$ 10.000,00 de novo, e o mês de R$ 20.000,00 absorve tudo.
        expect(resposta.body[0].totalVendas).toBe(10000);
        expect(resposta.body[0].estornoAbsorvido).toBe(10000);
        expect(resposta.body[0].valorTotal).toBe(1000);
        expect((await fechamentoDe(resposta.body[0].id as string))!.ids).toEqual([cancelado.id]);
      } finally {
        cliente.release();
      }

      const [linha] = await db
        .select({ estornadaEm: contratosTable.comissaoEstornadaEm })
        .from(contratosTable)
        .where(eq(contratosTable.id, cancelado.id));
      expect(linha!.estornadaEm).not.toBeNull();
    } finally {
      await limparFixture(f);
    }
  });
});
