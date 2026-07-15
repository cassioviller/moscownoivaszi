import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Leads", () => {
  test("funil lista os leads existentes", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByText("E2E Noiva Playwright")).toBeVisible();
  });

  test("detalhe do lead abre", async ({ page }) => {
    await page.goto(`/leads/${estado.leadId}`);
    await expect(page.getByText("E2E Noiva Playwright")).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C4): o botão "Novo Lead" em
  // leads/index.tsx:35-38 não tem handler — clicar não faz nada.
  // Sem esse formulário a operação não consegue registrar noivas.
  test("botão Novo Lead abre formulário e cadastra", async ({ page }) => {
    await page.goto("/leads");
    await page.getByRole("button", { name: "Novo Lead" }).click();
    await expect(
      page.getByRole("dialog"),
      "Novo Lead deveria abrir um formulário (botão sem handler em leads/index.tsx:35)",
    ).toBeVisible();

    await page.getByLabel(/noiva/i).fill("Noiva Criada Pelo E2E");
    await page.getByRole("dialog").getByRole("button", { name: /Cadastrar|Salvar/ }).click();
    await expect(page.getByText("Noiva Criada Pelo E2E").first()).toBeVisible();
  });
});
