import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, parcelasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ancoraDeNegocio } from "@workspace/financeiro-core";
import {
  criarFixture,
  criarLead,
  fecharPool,
  limparFixture,
  loginComLoja,
  type Fixture,
} from "./helpers";

/**
 * **E218 — o restante do valor entra até 20 dias antes da retirada**
 * (parágrafo único do objeto).
 *
 * > Em caso de parcelamento, o restante do valor deverá ser pago em até **20
 * > dias antes da data da retirada** dos itens objetos de locação.
 *
 * O prazo **recusa**; a reserva de 40% da 8ª §1º **avisa**, e a diferença é
 * medida (13/08/2026, `moscow_base`): **101 dos 208 contratos com entrada estão
 * abaixo dos 40%**, contra **2 de 6** parcelas fora do prazo. Recusar a
 * primeira tornaria quase metade do que a loja já fez irreproduzível pela
 * porta; o aviso mora na tela, com a régua do `financeiro-core`.
 *
 * **A cláusula fala do CARNÊ.** Avaria (E214), atraso na devolução (E212) e
 * mora (E213) nascem depois da retirada por definição — se a régua valesse para
 * toda parcela, ela recusaria as três.
 */
describe("E218 — o prazo dos 20 dias nas portas do carnê", () => {
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

  // Retirada numa sexta às 14h (dentro do expediente da 4ª, E222).
  // O limite do § único cai em 15/08/2026.
  const RETIRADA = "2026-09-04T14:00:00-03:00";

  async function fechar(body: Record<string, unknown> = {}) {
    const lead = await criarLead(f);
    return await agent
      .post(`/api/lojas/${f.lojaId}/contratos`)
      .send({ leadId: lead.id, vendedoraId: f.vendedoraId, valorTotal: 5000, ...body });
  }

  const gerarPlano = (contratoId: string, body: Record<string, unknown>) =>
    agent.post(`/api/lojas/${f.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`).send(body);

  describe("POST /contratos — o carnê que nasce junto com o contrato", () => {
    it("**parcela depois do limite é recusada, e a frase diz as duas datas**", async () => {
      const r = await fechar({
        dataRetirada: RETIRADA,
        parcelas: [
          { numero: 0, valorPrevisto: 2000, vencimento: ancoraDeNegocio("2026-07-10") },
          { numero: 1, valorPrevisto: 3000, vencimento: ancoraDeNegocio("2026-08-20") },
        ],
      });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("CARNE_DEPOIS_DO_PRAZO");
      expect(r.body.detalhe).toContain("15/08/2026");
      expect(r.body.detalhe).toContain("20/08/2026");
      expect(r.body.detalhe).toContain("parágrafo único");
    });

    it("no próprio dia-limite passa — 'até 20 dias antes' inclui o vigésimo", async () => {
      const r = await fechar({
        dataRetirada: RETIRADA,
        parcelas: [
          { numero: 0, valorPrevisto: 2000, vencimento: ancoraDeNegocio("2026-07-10") },
          { numero: 1, valorPrevisto: 3000, vencimento: ancoraDeNegocio("2026-08-15") },
        ],
      });
      expect(r.status).toBe(201);
    });

    it("**sem retirada declarada não há prazo — e é o caso de 722 dos 723**", async () => {
      const r = await fechar({
        parcelas: [{ numero: 0, valorPrevisto: 5000, vencimento: ancoraDeNegocio("2030-01-01") }],
      });
      expect(r.status).toBe(201);
    });

    it("a guarda olha TODAS as parcelas, não só a última da lista", async () => {
      // Nada obriga quem chama a API a mandar o carnê em ordem: aqui a que
      // estoura o prazo vem PRIMEIRO.
      const r = await fechar({
        dataRetirada: RETIRADA,
        parcelas: [
          { numero: 1, valorPrevisto: 3000, vencimento: ancoraDeNegocio("2026-08-30") },
          { numero: 0, valorPrevisto: 2000, vencimento: ancoraDeNegocio("2026-07-10") },
        ],
      });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("CARNE_DEPOIS_DO_PRAZO");
    });
  });

  describe("POST /parcelas/gerar-plano — a outra porta do carnê", () => {
    it("**o plano que passa do limite é recusado, e diz até quando pode vencer**", async () => {
      const criado = await fechar({ dataRetirada: RETIRADA });
      expect(criado.status).toBe(201);
      const r = await gerarPlano(criado.body.id, {
        numParcelas: 6,
        primeiroVencimento: ancoraDeNegocio("2026-07-10"),
      });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("CARNE_DEPOIS_DO_PRAZO");
      expect(r.body.campos[0].motivo).toContain("15/08/2026");
    });

    it("o plano que cabe é gravado inteiro", async () => {
      const criado = await fechar({ dataRetirada: RETIRADA });
      const r = await gerarPlano(criado.body.id, {
        numParcelas: 2,
        entrada: 2000,
        primeiroVencimento: ancoraDeNegocio("2026-07-15"),
      });
      expect(r.status).toBe(201);
      const linhas = await db
        .select()
        .from(parcelasTable)
        .where(eq(parcelasTable.contratoId, criado.body.id));
      expect(linhas.length).toBe(3); // entrada + 2
    });

    it("contrato sem retirada gera plano para qualquer data", async () => {
      const criado = await fechar({});
      const r = await gerarPlano(criado.body.id, {
        numParcelas: 3,
        primeiroVencimento: ancoraDeNegocio("2031-01-10"),
      });
      expect(r.status).toBe(201);
    });
  });

  describe("o que a cláusula NÃO alcança", () => {
    it("**a parcela avulsa passa depois da retirada** — avaria e atraso nascem lá", async () => {
      // Se a régua valesse para toda parcela, a cobrança de avaria (E214) e a
      // do atraso na devolução (E212) seriam recusadas por definição: as duas
      // acontecem DEPOIS de a peça sair e voltar.
      const criado = await fechar({ dataRetirada: RETIRADA });
      const r = await agent
        .post(`/api/lojas/${f.lojaId}/contratos/${criado.body.id}/parcelas`)
        .send({
          descricao: "Reparo de avaria",
          valorPrevisto: 350,
          vencimento: ancoraDeNegocio("2026-09-30"),
        });
      expect(r.status).toBe(201);
    });
  });
});
