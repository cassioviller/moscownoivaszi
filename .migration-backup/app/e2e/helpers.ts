import type { Page } from "@playwright/test";

// Loja e credenciais EFÊMERAS criadas pelo globalSetup (ver e2e/fixtures.ts).
// Sobrescrevíveis por env para CI.
export const LOJA = process.env.E2E_LOJA ?? "loja-e2e";
export const EMAIL = process.env.E2E_EMAIL ?? "admin-e2e@moscow.local";
export const SENHA = process.env.E2E_SENHA ?? "e2e-12345";

/** Autentica e sai da tela de /login. Não escolhe loja. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill("#email", EMAIL);
  await page.fill("#senha", SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
}

/** Autentica e garante LOJA como loja ativa (1 loja → auto-seleção server-side). */
export async function entrarNaLoja(page: Page): Promise<void> {
  await login(page);
  await page.goto("/selecionar-loja");
  if (page.url().includes("/selecionar-loja")) {
    await page.check(`input[name="lojaId"][value="${LOJA}"]`);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.endsWith("/selecionar-loja"));
  }
}
