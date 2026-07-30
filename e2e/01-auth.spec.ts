import { test, expect } from "@playwright/test";
import { lerEstado, loginViaUI, fecharTourDoAcesso } from "./helpers";

const estado = lerEstado();

test.describe("Autenticação", () => {
  test("senha errada mostra erro e permanece no login", async ({ page }) => {
    await loginViaUI(page, estado.adminEmail, "senha-completamente-errada");
    // O título mudou no E92 ("Erro ao fazer login" → "Não consegui entrar"),
    // junto com a `mensagemApi` que tirou o "HTTP 401 Unauthorized" do corpo do
    // toast. O que o teste cobra é o mesmo de sempre: a pessoa fica sabendo.
    await expect(page.getByText("Não consegui entrar").first()).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test("admin loga e chega à seleção de loja", async ({ page }) => {
    await loginViaUI(page, estado.adminEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja|dashboard/);
  });

  test("vendedora loga e chega à seleção de loja", async ({ page }) => {
    await loginViaUI(page, estado.mariaEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja|dashboard/);
  });

  test("logout encerra a sessão e volta ao login", async ({ page }) => {
    await loginViaUI(page, estado.adminEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja|dashboard/);
    if (page.url().includes("selecionar-loja")) {
      const selecionou = page.waitForResponse((res) => res.url().includes("/auth/selecionar-loja") && res.ok());
      await page.getByText(estado.lojaNome).first().click();
      await selecionou;
      // Workaround do bug de seleção travada (testado em 02-selecionar-loja).
      await page.goto("/dashboard");
    }
    await fecharTourDoAcesso(page);
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/login/);
  });
});
