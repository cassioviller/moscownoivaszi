import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, comissaoFechamentosTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E52: o custo de comissão como linha do tempo. `comissao_fechamentos` já
 * guardava tudo e nenhuma tela agregava — o dono via o mês corrente e nunca a
 * tendência nem a taxa efetiva.
 *
 * Os fechamentos entram por INSERÇÃO DIRETA, e isso é deliberado: `fechadoEm`
 * do contrato é carimbado pelo servidor (a autoridade é dele, e está certo),
 * então não há como criar venda datada no passado pela API — e sem venda
 * passada não há competência que possa fechar. O caminho de escrita já é
 * provado pelos testes de API do fechamento; aqui interessa a LEITURA.
 */
test.describe("Custo de comissão no tempo (E52)", () => {
  const comps = ["2025-02", "2025-03"];
  const ids = [randomUUID(), randomUUID()];
  /** Taxas diferentes de propósito: 5% num mês pequeno, 4% num grande. */
  const dados = [
    { competencia: comps[0], totalVendas: 20_000, valorTotal: 1_000 },
    { competencia: comps[1], totalVendas: 80_000, valorTotal: 3_200 },
  ];

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;

    // A unique (loja, vendedora, competência) pode ter sobrado de uma execução
    // anterior: apaga antes de inserir para o spec ser repetível.
    await db.delete(comissaoFechamentosTable).where(
      and(
        eq(comissaoFechamentosTable.lojaId, estado.lojaId),
        inArray(comissaoFechamentosTable.competencia, comps),
      ),
    );

    await db.insert(comissaoFechamentosTable).values(
      dados.map((d, i) => ({
        id: ids[i],
        lojaId: estado.lojaId,
        vendedoraId,
        competencia: d.competencia,
        totalVendas: d.totalVendas,
        percentualAplicado: 5,
        valorComissao: d.valorTotal,
        valorBonus: 0,
        valorTotal: d.valorTotal,
      })),
    );
  });

  test.afterAll(async () => {
    await db.delete(comissaoFechamentosTable).where(inArray(comissaoFechamentosTable.id, ids));
  });

  test("a série mostra cada mês fechado e a taxa efetiva do período", async ({ page }) => {
    await page.goto("/comissoes");

    const card = page.getByTestId("serie-comissao");
    await expect(card).toBeVisible();
    // Regex e não string: o E92 unificou as quatro cópias de
    // `rotuloCompetencia()` numa só, em MINÚSCULA, e pôs `capitalizar()` no
    // call-site — a tela mostra "Fevereiro de 2025". O que importa aqui é que
    // cada mês fechado apareça, não de que lado a inicial caiu.
    await expect(card).toContainText(/fevereiro de 2025/i);
    await expect(card).toContainText(/março de 2025/i);

    // Cada competência com o próprio custo — não o total somado numa linha só.
    await expect(card).toContainText("1.000,00");
    await expect(card).toContainText("3.200,00");

    // A taxa do PERÍODO é 4.200/100.000 = 4,2% — e não a média das taxas
    // mensais (5% e 4% → 4,5%), que pesaria o mês pequeno igual ao grande.
    await expect(card).toContainText("4.2%");
    await expect(card).not.toContainText("4.5%");
  });
});
