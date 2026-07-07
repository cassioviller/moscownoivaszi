import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros } from "./helpers";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Financeiro", () => {
  test("página carrega as contas a pagar sem erros de API", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/financeiro");
    await expect(page.getByText("Contas a Pagar")).toBeVisible();
    await expect(page.getByText("Aluguel")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      erros,
      `Financeiro não deveria gerar erros de API:\n${resumoErros(erros)}`,
    ).toEqual([]);
  });

  test("nenhum 'Invalid Date' ou 'NaN' renderizado na tela", async ({ page }) => {
    await page.goto("/financeiro");
    await page.waitForLoadState("networkidle");
    const corpo = (await page.locator("main, body").first().textContent()) ?? "";
    expect(corpo).not.toContain("Invalid Date");
    expect(corpo).not.toContain("NaN");
  });

  // FALHA ESPERADA no main (achado financeiro-recebiveis): a tela não lista
  // as parcelas a receber (há parcela PREVISTA no banco) nem oferece baixa —
  // o financeiro de entrada é inoperável pela interface.
  test("parcelas a receber aparecem com ação de baixa", async ({ page }) => {
    await page.goto("/financeiro");
    await expect(
      page.getByText(/Parcelas a Receber|A Receber/),
      "A tela deveria listar as parcelas a receber (financeiro/index.tsx não as consulta)",
    ).toBeVisible();
  });
});
