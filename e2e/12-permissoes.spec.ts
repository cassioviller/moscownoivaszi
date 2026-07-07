import { test, expect } from "@playwright/test";
import { lerEstado, sessaoViaAPI, API_URL } from "./helpers";

const estado = lerEstado();

test.describe("Permissões e multi-perfil", () => {
  // FALHA ESPERADA no main (achado C1 — BLOQUEADOR): routes/index.ts monta o
  // adminRouter sem prefixo; seus middlewares requireSuperAdmin valem para
  // TODA a API. A vendedora com vínculo e loja ativa recebe 403 em tudo.
  test("vendedora com loja ativa consegue listar leads", async ({ page }) => {
    const api = await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);

    // Evidência direta na API:
    const leads = await api.get(`/api/lojas/${estado.lojaId}/leads`);
    expect(
      leads.status(),
      `GET /lojas/{id}/leads como vendedora → ${leads.status()} (C1: adminRouter global torna a API superadmin-only)`,
    ).toBe(200);

    // E na interface:
    await page.goto("/leads");
    await expect(page.getByText("E2E Noiva Playwright")).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C13): o perfil Vendedora tem
  // financeiro=false e comissao=false, mas sidebar.tsx:20-31 mostra os 10
  // módulos para qualquer perfil — o modelo de permissões é decorativo.
  test("menu da vendedora esconde módulos sem acesso (financeiro/comissões)", async ({ page }) => {
    await sessaoViaAPI(page, estado.mariaEmail, estado.senha, estado.lojaId);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Financeiro" }),
      "Perfil Vendedora (financeiro=false) não deveria ver o menu Financeiro (sidebar.tsx sem filtro)",
    ).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Comissões" })).not.toBeVisible();
  });

  test("PROBE API: rotas de dados exigem sessão (anônimo → 401)", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/leads`);
    expect([401, 403]).toContain(res.status());
  });
});
