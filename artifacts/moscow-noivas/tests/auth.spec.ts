import { test, expect } from "@playwright/test";

// Login real pela UI (sem storageState) — valida o redirecionamento pós-login.
test.describe("autenticação", () => {
  test("super-admin cai em /admin (regressão do bug de roteamento)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("super@e2e.test");
    await page.getByLabel("Senha").fill("teste123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  });

  test("admin vai para a loja após login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("admin-a@e2e.test");
    await page.getByLabel("Senha").fill("teste123");
    await page.getByRole("button", { name: "Entrar" }).click();
    // 1 loja vinculada → auto-seleção → /loja/loja-a
    await expect(page).toHaveURL(/\/loja\/loja-a/);
    await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
  });

  test("credenciais inválidas mostram erro e ficam no login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("super@e2e.test");
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
