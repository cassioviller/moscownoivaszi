import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E31: o módulo /leads legado foi absorvido por /noivas. Estes testes provam
 * que os deep-links antigos ainda chegam ao módulo vivo (redirect) e que o
 * cadastro — que na tela legada era um botão sem handler (achado C4) — funciona
 * de verdade no fluxo unificado.
 */
test.describe("Leads → Noivas (E31)", () => {
  test("/leads redireciona para /noivas e lista os leads", async ({ page }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/noivas(\?|$)/);
    await expect(page.getByText("E2E Noiva Playwright")).toBeVisible();
  });

  test("/leads/:id redireciona para o detalhe da noiva", async ({ page }) => {
    await page.goto(`/leads/${estado.leadId}`);
    await expect(page).toHaveURL(new RegExp(`/noivas/${estado.leadId}(\\?|$)`));
    await expect(page.getByText("E2E Noiva Playwright")).toBeVisible();
  });

  test("cadastra uma noiva pelo fluxo unificado", async ({ page }) => {
    await page.goto("/noivas");
    await page.getByTestId("button-adicionar-noiva").click();
    await expect(page).toHaveURL(/\/noivas\/nova$/);

    await page.getByTestId("input-noiva-nome").fill("Noiva Criada Pelo E2E");
    await page.getByRole("button", { name: "Adicionar noiva" }).click();

    // O sucesso navega para o detalhe da noiva recém-criada.
    await expect(page).toHaveURL(/\/noivas\/[^/]+$/);
    await expect(page.getByText("Noiva Criada Pelo E2E").first()).toBeVisible();
  });
});
