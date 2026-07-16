import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Smoke das telas portadas na Onda 3 (o financeiro sobre `GET /pagamentos`).
 * Cada tela precisa montar, renderizar seu título e — o que mais importa numa
 * re-fiação server-action → client gerado — não tomar nenhum erro de API: um
 * mismatch de rota/contrato aparece aqui como 4xx/5xx, não como crash de render.
 */

/** Coleta respostas /api com status de erro enquanto a tela carrega. */
function observarApi(page: Page): string[] {
  const falhas: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      falhas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });
  return falhas;
}

const TELAS: { rota: string; titulo: string }[] = [
  { rota: "/financeiro", titulo: "Fluxo de caixa" },
  { rota: "/financeiro/dre", titulo: "Resultado do mês" },
  { rota: "/financeiro/projecao", titulo: "Projeção de caixa" },
  { rota: "/financeiro/cobranca", titulo: "Cobrança" },
  { rota: "/financeiro/receber", titulo: "Contas a receber" },
  { rota: "/financeiro/pagar", titulo: "Contas a pagar" },
];

for (const { rota, titulo } of TELAS) {
  test(`${rota} monta e carrega dados sem erro de API`, async ({ page }) => {
    const falhas = observarApi(page);
    await page.goto(rota);
    await expect(page.getByRole("heading", { name: titulo, exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(falhas, `Chamadas de API falharam em ${rota}: ${falhas.join(", ")}`).toEqual([]);
  });
}

/**
 * O filtro vive na URL: um deep-link precisa reabrir a mesma lente. É o que
 * permite compartilhar "o caixa daquele mês" sem explicar onde clicar.
 */
test("o intervalo do fluxo sobrevive ao deep-link", async ({ page }) => {
  await page.goto("/financeiro?ini=2026-01-01&fim=2026-01-31");
  await expect(page.getByRole("heading", { name: "Fluxo de caixa" })).toBeVisible();
  await expect(page.locator("#fluxo-ini")).toHaveValue("2026-01-01");
  await expect(page.locator("#fluxo-fim")).toHaveValue("2026-01-31");
});

test("o hub navega para o recorte e para a ação", async ({ page }) => {
  await page.goto("/financeiro");
  await page.getByRole("link", { name: /Resultado do mês/ }).click();
  await expect(page.getByRole("heading", { name: "Resultado do mês" })).toBeVisible();
});
