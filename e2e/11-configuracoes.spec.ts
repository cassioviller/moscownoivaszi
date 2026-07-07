import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros } from "./helpers";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Configurações", () => {
  test("página abre", async ({ page }) => {
    await page.goto("/configuracoes");
    await expect(page.getByText(/Configurações|Atributos|Cabines/).first()).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C2-disponibilidade): o cliente gerado chama
  // GET /api/lojas/{id}/disponibilidade; o servidor expõe
  // /api/lojas/{id}/disponibilidade/regras → 404 silencioso → a tela mostra
  // "não configuradas" mesmo com a regra gravada no banco (setup E2E garante).
  test("regra de disponibilidade configurada é exibida", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/configuracoes");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Regras de disponibilidade não configuradas."),
      `A regra EXISTE no banco; a tela nega por 404 na URL divergente (C2):\n${resumoErros(erros)}`,
    ).not.toBeVisible();
    await expect(page.getByText(/14 dias/)).toBeVisible();
  });
});
