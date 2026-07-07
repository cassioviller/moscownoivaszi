import { test, expect } from "@playwright/test";
import { lerEstado, loginViaUI } from "./helpers";

const estado = lerEstado();

test.describe("Seleção de loja", () => {
  test("admin vê a loja disponível", async ({ page }) => {
    await loginViaUI(page, estado.adminEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja/);
    await expect(page.getByText(estado.lojaNome)).toBeVisible();
  });

  // FALHA ESPERADA no main (achado NOVO descoberto na execução): clicar na
  // loja grava a sessão no servidor, mas a SPA volta para /selecionar-loja —
  // selecionar-loja.tsx:15 não invalida o getMe e app-layout.tsx:27 redireciona
  // porque o activeLojaId em memória continua null. Só um F5 destrava.
  test("selecionar a loja navega ao dashboard sem precisar de F5", async ({ page }) => {
    await loginViaUI(page, estado.adminEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja/);
    await page.getByText(estado.lojaNome).first().click();
    await expect(
      page,
      "Após selecionar a loja a SPA deveria chegar ao /dashboard (sessão stale: selecionar-loja.tsx + app-layout.tsx:27)",
    ).toHaveURL(/dashboard/, { timeout: 8_000 });
  });

  // FALHA ESPERADA no main (achado C5): selecionar-loja.tsx usa useListLojas()
  // → GET /api/admin/lojas (superadmin-only) em vez das lojas da sessão.
  // A vendedora COM vínculo no banco vê "Nenhuma loja encontrada" e trava aqui.
  test("vendedora com vínculo vê a própria loja para selecionar", async ({ page }) => {
    await loginViaUI(page, estado.mariaEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja/);
    await expect(
      page.getByText(estado.lojaNome),
      "Vendedora vinculada deveria ver sua loja (bug C5: página consome /admin/lojas)",
    ).toBeVisible();
  });
});
