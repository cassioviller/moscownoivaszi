import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros } from "./helpers";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Configurações", () => {
  test("página abre", async ({ page }) => {
    await page.goto("/configuracoes");
    await expect(page.getByText(/Configurações|Atributos|Cabines/).first()).toBeVisible();
  });

  // A regra que o seed grava (14 dias, global-setup) tem que aparecer na tela.
  // Prega o conserto do C2 (`2141e96`): cliente e servidor falam a mesma URL de
  // disponibilidade — se o 404 voltasse, os dois asserts abaixo cairiam.
  test("regra de disponibilidade configurada é exibida", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/configuracoes");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Regras de disponibilidade não configuradas."),
      `A regra EXISTE no banco (seed do E2E); a tela negou. Erros de API vistos:\n${resumoErros(erros)}`,
    ).not.toBeVisible();
    await expect(page.getByText(/14 dias/)).toBeVisible();
  });

  // E148: `provaDuracao` é contado em SLOTS de 30 min (`agenda.ts:93` faz
  // `provaDuracao * 30 * 60_000`; o spec 26 registra "o seed usa 2 = 1h"), e a
  // tela mostrava o número cru — "2 min" para uma prova de uma hora, na única
  // tela que existe para explicar a régua. Com o seed padrão, 2 slots = 60 min.
  test("a duração da prova é exibida em minutos, não em slots", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/60 min/)).toBeVisible();
    await expect(page.getByText(/\b2 min\b/)).not.toBeVisible();
  });
});
