import { test, expect } from "@playwright/test";

const NAO_ENCONTRADO = "404 Page Not Found";

test.describe("smoke · super-admin", () => {
  test.use({ storageState: "tests/.auth/super.json" });

  for (const [path, heading] of [
    ["/admin", /Administração/],
    ["/admin/perfis", null],
  ] as Array<[string, RegExp | null]>) {
    test(`abre ${path}`, async ({ page }) => {
      const erros: string[] = [];
      page.on("pageerror", (e) => erros.push(String(e)));
      await page.goto(path);
      await expect(page.getByText(NAO_ENCONTRADO)).toHaveCount(0);
      if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await page.screenshot({ path: `test-results/smoke-super${path.replace(/\//g, "_")}.png` });
      expect(erros, `erros JS em ${path}`).toEqual([]);
    });
  }
});

test.describe("smoke · admin da loja", () => {
  test.use({ storageState: "tests/.auth/admin-a.json" });
  const L = "/loja/loja-a";

  const paginas: Array<[string, RegExp | null]> = [
    [`${L}`, /Início/],
    [`${L}/noivas`, /Noivas/],
    [`${L}/vestidos`, /Vestidos/],
    [`${L}/contratos`, /Contratos/],
    [`${L}/atendimentos/novo`, null],
    [`${L}/calendario`, /Calendário/],
    [`${L}/reservas`, /Reservas/],
    [`${L}/financeiro`, /Fluxo de caixa/],
    [`${L}/financeiro/receber`, /Contas a receber/],
    [`${L}/financeiro/pagar`, /Contas a pagar/],
    [`${L}/financeiro/comissoes`, /Comissões/],
    [`${L}/permissoes`, /Permissões/],
    ["/equipe", /Equipe/],
  ];

  for (const [path, heading] of paginas) {
    test(`abre ${path}`, async ({ page }) => {
      const erros: string[] = [];
      page.on("pageerror", (e) => erros.push(String(e)));
      await page.goto(path);
      await expect(page.getByText(NAO_ENCONTRADO)).toHaveCount(0);
      if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await page.screenshot({ path: `test-results/smoke-admin${path.replace(/\//g, "_")}.png` });
      expect(erros, `erros JS em ${path}`).toEqual([]);
    });
  }

  // Documenta o gap conhecido: links do menu sem rota na SPA caem em 404.
  test("links de menu sem rota viram 404 (gap conhecido da migração)", async ({ page }) => {
    for (const sufixo of ["/provas", "/ajustes", "/catalogo"]) {
      await page.goto(`/loja/loja-a${sufixo}`);
      await expect(page.getByText(NAO_ENCONTRADO)).toBeVisible();
    }
  });
});
