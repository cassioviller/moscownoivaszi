import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros } from "./helpers";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * A partir da Onda 3, `/financeiro` é o **fluxo de caixa** — o hub, de leitura
 * pura. As contas e as parcelas ganharam telas próprias de ação
 * (`/financeiro/pagar`, `/financeiro/receber`), então é lá que este spec as
 * procura. A intenção dos testes é a de sempre: o financeiro precisa ser
 * operável pela interface, dos dois lados.
 */

test.describe("Financeiro", () => {
  test("hub carrega o caixa do período sem erros de API", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/financeiro");
    await expect(page.getByRole("heading", { name: "Fluxo de caixa" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      erros,
      `Financeiro não deveria gerar erros de API:\n${resumoErros(erros)}`,
    ).toEqual([]);
  });

  test("contas a pagar aparecem com ação de pagamento", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/financeiro/pagar");
    await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();
    await expect(page.getByText("Aluguel").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagar" }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(erros, `Erros de API em /financeiro/pagar:\n${resumoErros(erros)}`).toEqual([]);
  });

  // Regressão do achado `financeiro-recebiveis`: no main a tela não listava as
  // parcelas a receber nem oferecia baixa — o financeiro de entrada era
  // inoperável pela interface.
  test("parcelas a receber aparecem com ação de baixa", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/financeiro/receber");
    await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Receber" }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(erros, `Erros de API em /financeiro/receber:\n${resumoErros(erros)}`).toEqual([]);
  });

  test("o hub leva às telas de ação pelo que está em aberto", async ({ page }) => {
    await page.goto("/financeiro");
    await page.getByRole("link", { name: /A receber/ }).click();
    await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
  });

  test("nenhum 'Invalid Date' ou 'NaN' renderizado nas telas do financeiro", async ({ page }) => {
    for (const rota of ["/financeiro", "/financeiro/pagar", "/financeiro/receber"]) {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      const corpo = (await page.locator("main, body").first().textContent()) ?? "";
      expect(corpo, `${rota} renderizou data inválida`).not.toContain("Invalid Date");
      expect(corpo, `${rota} renderizou NaN`).not.toContain("NaN");
    }
  });
});
