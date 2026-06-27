import { test, expect } from "@playwright/test";
import { entrarNaLoja, LOJA } from "./helpers";

// Suíte READ-ONLY: confirma render + gate de autenticação na loja efêmera `loja-e2e`.
// Não depende de dados semeados — a loja pode estar vazia. Os asserts só verificam
// que a página rendeza (heading/<main>) e que não fomos jogados de volta ao /login.
// O layout de /loja/[lojaId] envolve TODA página num <main> (layout.tsx) e várias
// páginas têm o seu próprio <main> aninhado → usamos `.first()` para evitar
// violação de strict mode quando há mais de um <main> na árvore.
test.describe("Jornada do atelier (autenticado)", () => {
  test.beforeEach(async ({ page }) => {
    await entrarNaLoja(page);
  });

  test("Início mostra o Dia do atelier", async ({ page }) => {
    await page.goto(`/loja/${LOJA}`);
    await expect(page).not.toHaveURL(/\/login/);
    // h2 "Hoje no atelier" — coração do dashboard (page.tsx).
    await expect(page.locator('h2:has-text("Hoje no atelier")')).toBeVisible();
  });

  test("Noivas: o acervo de noivas carrega", async ({ page }) => {
    await page.goto(`/loja/${LOJA}/noivas`);
    await expect(page).toHaveURL(new RegExp(`/loja/${LOJA}/noivas`));
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("Vestidos: o acervo carrega", async ({ page }) => {
    await page.goto(`/loja/${LOJA}/vestidos`);
    await expect(page).toHaveURL(/\/vestidos/);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("Calendário: a aba Mês renderiza", async ({ page }) => {
    await page.goto(`/loja/${LOJA}/calendario?aba=mes`);
    await expect(page).toHaveURL(/\/calendario/);
    await expect(page.locator("main").first()).toBeVisible();
  });
});
