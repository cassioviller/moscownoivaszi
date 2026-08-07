import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, orcamentosTable, orcamentoItensTable, leadInteressesTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E33: o teto de orçamento que a noiva deu em Interesses passa a ser
 * confrontado com o líquido do orçamento. Cada teste cria seu próprio
 * orçamento com um item de valor conhecido e ajusta o teto do lead do seed.
 */
test.describe("Orçamento — aviso de teto (E33)", () => {
  // Cada teste cria um orçamento novo e o banco do e2e persiste: o afterAll
  // apaga exatamente os ids que este run juntou aqui.
  const orcamentoIds: string[] = [];
  // S-D24: `definirTeto` muta o interesse do lead do SEED, e o último valor do
  // run ficava — o banco de dev carregou um teto de 100.000 desde a primeira
  // execução deste spec, estado que qualquer outro spec herdaria. O que havia
  // ANTES volta no afterAll, inclusive o caso "não havia interesse".
  let tetoAntes: number | null = null;
  let haviaInteresse = false;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const [interesse] = await db
      .select()
      .from(leadInteressesTable)
      .where(eq(leadInteressesTable.leadId, estado.leadId));
    haviaInteresse = !!interesse;
    tetoAntes = interesse?.tetoOrcamento ?? null;
  });

  test.afterAll(async () => {
    if (orcamentoIds.length > 0) {
      // Itens antes dos orçamentos (mesma ordem que os FKs pedem); o lead é do
      // seed e fica.
      await db.delete(orcamentoItensTable).where(inArray(orcamentoItensTable.orcamentoId, orcamentoIds));
      await db.delete(orcamentosTable).where(inArray(orcamentosTable.id, orcamentoIds));
    }
    // O teto volta a ser o que era. Se o interesse nem existia, ele sai — o
    // upsert do PUT foi este spec quem disparou.
    if (haviaInteresse) {
      await db
        .update(leadInteressesTable)
        .set({ tetoOrcamento: tetoAntes })
        .where(eq(leadInteressesTable.leadId, estado.leadId));
    } else {
      await db.delete(leadInteressesTable).where(eq(leadInteressesTable.leadId, estado.leadId));
    }
  });

  async function orcamentoCom(request: any, valorItem: number): Promise<string> {
    const orc = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos`, {
      data: { leadId: estado.leadId },
    });
    expect(orc.status(), await orc.text()).toBe(201);
    const { id } = (await orc.json()) as { id: string };
    orcamentoIds.push(id);
    const item = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${id}/itens`, {
      data: { tipo: "VESTIDO", descricao: "Vestido E2E", valorUnitario: valorItem, quantidade: 1 },
    });
    expect(item.status(), await item.text()).toBe(201);
    return id;
  }

  async function definirTeto(request: any, teto: number) {
    const res = await request.put(`${API_URL}/api/lojas/${estado.lojaId}/leads/${estado.leadId}/interesse`, {
      data: { tetoOrcamento: teto },
    });
    expect(res.status(), await res.text()).toBe(200);
  }

  test("líquido acima do teto acende o aviso", async ({ page, request }) => {
    await definirTeto(request, 100);
    const id = await orcamentoCom(request, 1000);

    await page.goto(`/orcamentos/${id}`);
    const aviso = page.getByTestId("aviso-acima-teto");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("acima do teto");
  });

  test("líquido dentro do teto não acende nada", async ({ page, request }) => {
    await definirTeto(request, 100000);
    const id = await orcamentoCom(request, 1000);

    await page.goto(`/orcamentos/${id}`);
    // O total precisa ter renderizado antes de afirmar a ausência do aviso.
    await expect(page.getByText(/Total: R\$/)).toBeVisible();
    await expect(page.getByTestId("aviso-acima-teto")).toHaveCount(0);
  });
});
