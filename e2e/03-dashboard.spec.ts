import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros } from "./helpers";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Dashboard", () => {
  test("KPIs carregam com dados reais e sem erros de API", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
    await expect(page.getByText("Novos Leads")).toBeVisible();
    // Há leads seedados: o KPI não pode ser vazio.
    const kpi = page.locator("div.text-2xl").first();
    await expect(kpi).not.toBeEmpty();

    await page.waitForLoadState("networkidle");
    expect(erros, `Dashboard não deveria gerar erros de API:\n${resumoErros(erros)}`).toEqual([]);
  });

  // FALHA ESPERADA no main (achado UX-dashboard): dashboard.tsx:96-115 tem
  // "Próximos Atendimentos" e "Leads Recentes" HARDCODED como vazio — mentem
  // quando há dados (há leads e atendimento seedados no banco).
  test("Leads Recentes reflete os leads existentes (não placeholder fixo)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Leads Recentes")).toBeVisible();
    await expect(
      page.getByText("Nenhum lead novo recentemente."),
      "Há leads no banco — o card não pode estar hardcoded como vazio (dashboard.tsx:111)",
    ).not.toBeVisible();
  });
});
