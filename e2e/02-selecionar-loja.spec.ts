import { test, expect } from "@playwright/test";
import { lerEstado, loginViaUI } from "./helpers";

const estado = lerEstado();

test.describe("Seleção de loja", () => {
  test("admin vê a loja disponível", async ({ page }) => {
    await loginViaUI(page, estado.adminEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja/);
    await expect(page.getByText(estado.lojaNome)).toBeVisible();
  });

  // Era FALHA ESPERADA no main: clicar na loja gravava a sessão no servidor mas
  // a SPA voltava para /selecionar-loja, porque a tela não invalidava o getMe e
  // o AppLayout redirecionava com o `activeLojaId` em memória ainda null — só
  // um F5 destravava. Passa desde a Onda 0 (rotas aninhadas) + a adoção do
  // fix/auditoria; conferido em 2026-07-25 revertendo o D1/E93, que NÃO é o
  // conserto deste caso. O comentário anterior dizia o contrário e envelheceu.
  test("selecionar a loja navega ao dashboard sem precisar de F5", async ({ page }) => {
    await loginViaUI(page, estado.adminEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja/);
    await page.getByText(estado.lojaNome).first().click();
    await expect(
      page,
      "Após selecionar a loja a SPA deveria chegar ao /dashboard (sessão stale: selecionar-loja.tsx + app-layout.tsx:27)",
    ).toHaveURL(/dashboard/, { timeout: 8_000 });
  });

  // Era FALHA ESPERADA no main (achado C5): a tela consumia `useListLojas()` →
  // GET /api/admin/lojas (superadmin-only) em vez das lojas da sessão, e a
  // vendedora COM vínculo no banco via "Nenhuma loja encontrada". Corrigido —
  // `selecionar-loja.tsx` lê `session.lojas` do /auth/me. Verde em 2026-07-25.
  test("vendedora com vínculo vê a própria loja para selecionar", async ({ page }) => {
    await loginViaUI(page, estado.mariaEmail, estado.senha);
    await expect(page).toHaveURL(/selecionar-loja/);
    await expect(
      page.getByText(estado.lojaNome),
      "Vendedora vinculada deveria ver sua loja (bug C5: página consome /admin/lojas)",
    ).toBeVisible();
  });
});
