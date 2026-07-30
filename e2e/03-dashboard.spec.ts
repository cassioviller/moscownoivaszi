import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros } from "./helpers";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E82: o spec acompanhou o dashboard do E66 — "Seu dia" com os quatro KPIs
 * do funil, o horizonte do caixa e as noivas que precisam de contato. Os
 * asserts antigos ("Novos Leads"/"Leads Recentes") eram da tela anterior.
 */
test.describe("Dashboard", () => {
  test("KPIs carregam com dados reais e sem erros de API", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: /Seu dia/ })).toBeVisible();
    await expect(page.getByText("Noivas ativas")).toBeVisible();
    await expect(page.getByText("Contratos fechados")).toBeVisible();
    // Há leads seedados: o KPI não pode ser vazio.
    const kpi = page.locator("div.text-2xl").first();
    await expect(kpi).not.toBeEmpty();

    await page.waitForLoadState("networkidle");
    expect(erros, `Dashboard não deveria gerar erros de API:\n${resumoErros(erros)}`).toEqual([]);
  });

  test("o dia e o funil aparecem — agenda de hoje e quem precisa de contato", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Hoje na loja")).toBeVisible();
    await expect(page.getByText("Precisam de contato")).toBeVisible();
    // O horizonte do caixa aponta para as telas de ação.
    await expect(page.getByText(/A receber — próximos 30 dias/)).toBeVisible();
  });
});
