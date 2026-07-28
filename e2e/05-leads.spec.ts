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
    // E9/E98: o nome aparece DUAS vezes na ficha por desenho — no último item da
    // trilha ("Noivas › Ana Silva", que é onde a pessoa está) e no <h1>. Um
    // `getByText` solto virou ambíguo; o testid diz qual dos dois interessa.
    await expect(page.getByTestId("text-noiva-nome")).toHaveText(/E2E Noiva Playwright/);
  });

  test("cadastra uma noiva pelo fluxo unificado", async ({ page }) => {
    await page.goto("/noivas");
    await page.getByTestId("button-adicionar-noiva").click();
    await expect(page).toHaveURL(/\/noivas\/nova$/);

    await page.getByTestId("input-noiva-nome").fill("Noiva Criada Pelo E2E");
    // E98/F2: a origem passou a NASCER VAZIA. Este spec passava sem tocá-la
    // porque o formulário respondia "Loja" por quem cadastrava — que é o
    // defeito, não a conveniência: era assim que toda noiva captada pelo
    // Instagram entrava na coluna da loja física do relatório de conversão.
    await page.getByTestId("select-noiva-origem").click();
    await page.getByRole("option", { name: "Instagram" }).click();
    await page.getByRole("button", { name: "Adicionar noiva" }).click();

    // O sucesso navega para o detalhe da noiva recém-criada.
    await expect(page).toHaveURL(/\/noivas\/[^/]+$/);
    await expect(page.getByText("Noiva Criada Pelo E2E").first()).toBeVisible();
  });
});
