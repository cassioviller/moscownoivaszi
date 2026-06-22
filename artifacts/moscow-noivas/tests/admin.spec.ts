import { test, expect } from "@playwright/test";

test.describe("console super-admin", () => {
  test.use({ storageState: "tests/.auth/super.json" });

  test("cria uma loja", async ({ page }) => {
    await page.goto("/admin");
    await page.getByPlaceholder("Nome da nova loja").fill("Atelier Teste E2E");
    await page.getByRole("button", { name: "Criar loja" }).click();
    await expect(page.getByText("Atelier Teste E2E")).toBeVisible();
  });

  test("cadastra um admin de loja", async ({ page }) => {
    await page.goto("/admin");
    // Labels do form de admin não têm htmlFor; seleciona pelos tipos de input.
    await page.locator('input[type="text"]:not([placeholder])').fill("Admin Novo E2E");
    await page.locator('input[type="email"]').fill("novo-admin@e2e.test");
    await page.locator('input[type="password"]').fill("teste123");
    await page.locator("select[multiple]").selectOption({ label: "Atelier SP" });
    await page.getByRole("button", { name: "Cadastrar admin" }).click();
    await expect(page.getByText("Admin cadastrado.")).toBeVisible();
  });

  test("abre a tela de perfis", async ({ page }) => {
    await page.goto("/admin/perfis");
    await expect(page.getByText("404 Page Not Found")).toHaveCount(0);
  });
});
