import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool, auditLogTable, contasPagarTable, pagamentoItensTable, pagamentosTable } from "@workspace/db";
import { criarFixture, fecharPool, limparFixture, loginComLoja, type Fixture } from "./helpers";

/**
 * S-O120 — **o estorno do pagamento decide sobre o estado que leu no pool, e
 * o pagamento repete no `where` o status que leu.**
 *
 * `quitarContas` (`financeiro.ts`) e o `POST /pagamentos/:id/estornar` mudavam
 * `contas_pagar.status` (`PREVISTA` → `PAGA`, `PAGA` → `PREVISTA`) sem repetir
 * no `where` o status lido e sem tranca. Do lado de PAGAR a UNIQUE de
 * `pagamento_itens.conta_pagar_id` segurava o segundo clique (23505 →
 * `CONTA_JA_PAGA`); do lado do ESTORNO não havia rede nenhuma, e a corrida está
 * construída aqui no molde do `so79`/`E238`: uma segunda conexão faz o gesto e
 * NÃO commita; a rota entra e fica pendurada na linha que a conexão segura; a
 * conexão commita; a rota acorda e decide.
 *
 * Sem o CAS, a rota acorda com a decisão VELHA: o `UPDATE contas_pagar SET
 * status = 'PREVISTA' WHERE id IN (…)` re-avalia o `where` (READ COMMITTED),
 * a conta continua existindo, e a rota a devolve para PREVISTA por cima do
 * pagamento NOVO que a outra conexão acabou de gravar — a conta aparece como
 * aberta na lista, o caixa tem a saída, e ninguém consegue pagá-la de novo
 * (a UNIQUE recusa). Com o CAS, o `DELETE pagamentos … RETURNING` é quem
 * responde: zero linhas é "outro estornou antes", 409, e a conta fica como
 * o pagamento novo a deixou.
 */
describe("S-O120 — estornar × pagar de novo, no mesmo segundo", () => {
  afterAll(async () => {
    await fecharPool();
  });

  async function contaPaga(f: Fixture) {
    const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
    const conta = await ag
      .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
      .send({ tipo: "DESPESA", descricao: "Aluguel do ateliê", valorPrevisto: 1500, vencimento: new Date().toISOString() })
      .expect(201);
    const pago = await ag
      .post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`)
      .send({ contaIds: [conta.body.id], data: new Date().toISOString(), forma: "PIX" })
      .expect(201);
    return { ag, contaId: conta.body.id as string, pagamentoId: pago.body.id as string };
  }

  const estadoDaConta = async (contaId: string) => {
    const [c] = await db.select({ status: contasPagarTable.status }).from(contasPagarTable).where(eq(contasPagarTable.id, contaId));
    const itens = await db.select({ pagamentoId: pagamentoItensTable.pagamentoId }).from(pagamentoItensTable).where(eq(pagamentoItensTable.contaPagarId, contaId));
    return { status: c?.status, pagamentos: itens.map((i) => i.pagamentoId) };
  };

  const estornosNaTrilha = async (f: Fixture, pagamentoId: string) =>
    db.select({ id: auditLogTable.id }).from(auditLogTable).where(and(
      eq(auditLogTable.lojaId, f.lojaId),
      eq(auditLogTable.acao, "PAGAMENTO_ESTORNADO"),
      eq(auditLogTable.entidadeId, pagamentoId),
    ));

  /**
   * A cena com dinheiro: outra pessoa estornou o pagamento P1 e pagou a conta
   * de novo (P2) — a transação dela ainda não commitou quando a rota entra
   * para estornar o MESMO P1.
   */
  it("o estorno que perdeu a corrida não devolve a conta a PREVISTA por cima do pagamento novo", async () => {
    const f = await criarFixture();
    try {
      const { ag, contaId, pagamentoId } = await contaPaga(f);
      const p2 = `so120-p2-${f.lojaId}`;

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        // O gesto da outra pessoa: estorna P1 e paga de novo (P2), sem commitar.
        await cliente.query("DELETE FROM pagamentos WHERE id = $1", [pagamentoId]);
        await cliente.query("UPDATE contas_pagar SET status = 'PREVISTA' WHERE id = $1", [contaId]);
        await cliente.query(
          "INSERT INTO pagamentos (id, loja_id, data, valor_pago, forma) VALUES ($1, $2, now(), 1500, 'PIX')",
          [p2, f.lojaId],
        );
        await cliente.query(
          "INSERT INTO pagamento_itens (id, loja_id, pagamento_id, conta_pagar_id, valor) VALUES ($1, $2, $3, $4, 1500)",
          [`${p2}-item`, f.lojaId, p2, contaId],
        );
        await cliente.query("UPDATE contas_pagar SET status = 'PAGA' WHERE id = $1", [contaId]);

        // A rota lê P1 no pool (ainda visível), entra na transação e fica
        // pendurada na linha que a conexão segura.
        const respostaP = Promise.resolve(
          ag.post(`/api/lojas/${f.lojaId}/financeiro/pagamentos/${pagamentoId}/estornar`),
        );
        // E247 (G8): a prova de que a rota ESPEROU — sob máquina carregada, o sleep
        // sozinho fica verde sem tranca nenhuma. A resposta NÃO pode ter chegado
        // antes do COMMIT.
        let chegou_respostaP = false;
        void respostaP.then(() => { chegou_respostaP = true; }, () => { chegou_respostaP = true; });
        await new Promise((r) => setTimeout(r, 300));
        expect(chegou_respostaP, "a rota respondeu ANTES do commit — não esperou a tranca").toBe(false);
        await cliente.query("COMMIT");

        const resposta = await respostaP;
        // A conta fica como o pagamento NOVO a deixou: PAGA, presa a P2. (Sem
        // o CAS: PREVISTA presa a P2 — aberta na lista, no caixa, e impagável.)
        expect(await estadoDaConta(contaId)).toEqual({ status: "PAGA", pagamentos: [p2] });
        // Perdeu a corrida: P1 já não existe quando ela acorda.
        expect(resposta.status).toBe(409);
        expect(resposta.body.error).toBe("PAGAMENTO_JA_ESTORNADO");
      } finally {
        cliente.release();
      }

      // E a trilha não ganhou um estorno que não aconteceu.
      expect((await estornosNaTrilha(f, pagamentoId)).length).toBe(0);
    } finally {
      await limparFixture(f);
    }
  });

  /** O duplo clique em "estornar": o segundo acorda depois do primeiro commitar. */
  it("dois estornos do mesmo pagamento: um 204, um 409, e UMA linha na trilha", async () => {
    const f = await criarFixture();
    try {
      const { ag, contaId, pagamentoId } = await contaPaga(f);

      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query("DELETE FROM pagamentos WHERE id = $1", [pagamentoId]);
        await cliente.query("UPDATE contas_pagar SET status = 'PREVISTA' WHERE id = $1", [contaId]);

        const respostaP = Promise.resolve(
          ag.post(`/api/lojas/${f.lojaId}/financeiro/pagamentos/${pagamentoId}/estornar`),
        );
        // E247 (G8): a mesma prova de espera da cena acima.
        let chegou_respostaP = false;
        void respostaP.then(() => { chegou_respostaP = true; }, () => { chegou_respostaP = true; });
        await new Promise((r) => setTimeout(r, 300));
        expect(chegou_respostaP, "a rota respondeu ANTES do commit — não esperou a tranca").toBe(false);
        await cliente.query("COMMIT");

        const resposta = await respostaP;
        expect(resposta.status).toBe(409);
        expect(resposta.body.error).toBe("PAGAMENTO_JA_ESTORNADO");
      } finally {
        cliente.release();
      }

      expect(await estadoDaConta(contaId)).toEqual({ status: "PREVISTA", pagamentos: [] });
      // A conexão crua não escreve trilha; a rota que perdeu também não pode.
      expect((await estornosNaTrilha(f, pagamentoId)).length).toBe(0);
    } finally {
      await limparFixture(f);
    }
  });

  /**
   * O lado de PAGAR: dois cliques no mesmo segundo sobre a mesma conta. A
   * UNIQUE já segurava o segundo (23505 → CONTA_JA_PAGA); com o CAS ele perde
   * ANTES de inserir a saída, e a resposta é a mesma. A cena fica registrada
   * porque é o efeito que a S-O120 promete — e é verde nos dois lados: a rede
   * antiga também segurava, e o relatório diz isso.
   */
  it("pagar a mesma conta duas vezes ao mesmo tempo: uma saída no caixa, e a conta PAGA uma vez", async () => {
    const f = await criarFixture();
    try {
      const ag = await loginComLoja(f.superAdminEmail, f.lojaId);
      const conta = await ag
        .post(`/api/lojas/${f.lojaId}/financeiro/contas-pagar`)
        .send({ tipo: "DESPESA", descricao: "Luz", valorPrevisto: 300, vencimento: new Date().toISOString() })
        .expect(201);
      const contaId = conta.body.id as string;

      const [a, b] = await Promise.all([
        ag.post(`/api/lojas/${f.lojaId}/contas-pagar/${contaId}/pagar`).send({ data: new Date().toISOString(), valorPago: 300 }),
        ag.post(`/api/lojas/${f.lojaId}/financeiro/pagamentos`).send({ contaIds: [contaId], data: new Date().toISOString() }),
      ]);
      // Exatamente UMA das duas entrou; a outra ouviu CONTA_JA_PAGA.
      const venceu = [a, b].filter((r) => r.status === 200 || r.status === 201);
      const perdeu = [a, b].filter((r) => r.status === 409);
      expect(venceu.length + perdeu.length).toBe(2);
      expect(venceu.length).toBe(1);
      expect(perdeu[0].body.error).toBe("CONTA_JA_PAGA");

      const saidas = await db.select({ id: pagamentosTable.id }).from(pagamentosTable).where(eq(pagamentosTable.lojaId, f.lojaId));
      expect(saidas.length).toBe(1);
      expect((await estadoDaConta(contaId)).status).toBe("PAGA");
    } finally {
      await limparFixture(f);
    }
  });
});
