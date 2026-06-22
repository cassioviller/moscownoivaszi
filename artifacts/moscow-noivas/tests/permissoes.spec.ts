import { test, expect } from "@playwright/test";

test.describe("permissões · vendedora", () => {
  test.use({ storageState: "tests/.auth/vend-a.json" });

  test("não vê links de financeiro/equipe/permissões", async ({ page }) => {
    await page.goto("/loja/loja-a");
    await expect(page.getByRole("heading", { name: /Início/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contas a receber" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Equipe" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Permissões" })).toHaveCount(0);
  });

  test("URL de financeiro proibida redireciona para a loja", async ({ page }) => {
    await page.goto("/loja/loja-a/financeiro/receber");
    await expect(page).toHaveURL(/\/loja\/loja-a$/);
  });

  test("não acessa a tela de Equipe", async ({ page }) => {
    await page.goto("/equipe");
    await expect(page).not.toHaveURL(/\/equipe/);
  });
});

test.describe("permissões · recepção", () => {
  test.use({ storageState: "tests/.auth/recep-a.json" });

  test("vê Noivas mas não vê Financeiro", async ({ page }) => {
    await page.goto("/loja/loja-a");
    await expect(page.getByRole("link", { name: "Noivas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contas a receber" })).toHaveCount(0);
  });
});
