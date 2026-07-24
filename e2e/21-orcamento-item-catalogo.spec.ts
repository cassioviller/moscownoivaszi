import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E35: o item de orçamento pode vir do catálogo. Escolher um vestido preenche
 * descrição e valor e vincula o item ao estoque (vestidoId) — que a linha do
 * item mostra como link para a ficha.
 */
test.describe("Orçamento — item do catálogo (E35)", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
  });

  test("escolher vestido preenche descrição/valor e vincula o item", async ({ page, request }) => {
    const orc = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos`, {
      data: { leadId: estado.leadId },
    });
    expect(orc.status(), await orc.text()).toBe(201);
    const { id } = (await orc.json()) as { id: string };

    await page.goto(`/orcamentos/${id}`);

    // Tipo já é VESTIDO por padrão: o seletor do catálogo aparece.
    const seletor = page.getByTestId("select-vestido-catalogo");
    await expect(seletor).toBeVisible();
    await seletor.click();
    await page.getByRole("option", { name: /E2E-V900/ }).click();

    // Descrição e valor vieram do vestido escolhido.
    await expect(page.getByLabel("Descrição")).toHaveValue("E2E Vestido Playwright");
    await expect(page.getByLabel("Valor (R$)")).toHaveValue("4200");

    await page.getByRole("button", { name: "Adicionar", exact: true }).click();

    // O item entrou ligado ao catálogo: a linha mostra o código como link.
    const link = page.getByTestId("link-item-vestido").first();
    await expect(link).toBeVisible();
    await expect(link).toHaveText("E2E-V900");
  });
});
