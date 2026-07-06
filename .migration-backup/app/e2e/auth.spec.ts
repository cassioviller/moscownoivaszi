import { test, expect } from "@playwright/test";
import { LOJA, EMAIL, SENHA } from "./helpers";

test.describe("Autenticação e gate", () => {
  test("rota protegida sem sessão redireciona para /login", async ({ page }) => {
    await page.goto(`/loja/${LOJA}`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("login com credenciais válidas sai da tela de login", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", EMAIL);
    await page.fill("#senha", SENHA);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);
  });
});
