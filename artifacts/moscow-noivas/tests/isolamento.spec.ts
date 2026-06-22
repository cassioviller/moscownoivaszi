import { test, expect } from "@playwright/test";

// admin-b tem lojaAtiva = loja-b; não pode operar a loja-a.
test.describe("isolamento entre lojas", () => {
  test.use({ storageState: "tests/.auth/admin-b.json" });

  test("admin-b é expulso ao tentar abrir uma página da loja-a", async ({ page }) => {
    await page.goto("/loja/loja-a/noivas");
    await expect(page).toHaveURL(/\/loja\/loja-b/);
  });

  test("admin-b não vê a noiva cadastrada na loja-a", async ({ page }) => {
    await page.goto("/loja/loja-b/noivas");
    await expect(page.getByRole("heading", { name: /Noivas/ })).toBeVisible();
    await expect(page.getByText("Ana Isolamento")).toHaveCount(0);
  });
});
