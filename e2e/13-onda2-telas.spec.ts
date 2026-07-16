import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Smoke das telas portadas na Onda 2 (atendimentos, provas, ajustes, reservas).
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
  { rota: "/atendimentos", titulo: "Atendimentos" },
  { rota: "/atendimentos/novo", titulo: "Agendar" },
  { rota: "/atendimentos/config", titulo: "Cabines & horário" },
  { rota: "/provas", titulo: "Provas" },
  { rota: "/ajustes", titulo: "Ajustes" },
  { rota: "/reservas", titulo: "Reservas" },
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

test("navegação lateral expõe as telas da Onda 2", async ({ page }) => {
  await page.goto("/dashboard");
  for (const label of ["Atendimentos", "Provas", "Ajustes", "Reservas"]) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }
});

test("detalhe da reserva abre a partir da lista", async ({ page }) => {
  const falhas = observarApi(page);
  await page.goto("/reservas");
  await expect(page.getByRole("heading", { name: "Reservas", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("E2E Noiva Playwright")).toBeVisible();
  await page.getByRole("link", { name: "Provas & ajustes" }).first().click();
  await expect(page).toHaveURL(/\/reservas\/e2e-bloqueio-1$/);
  // O detalhe resolve as relações do bloqueio (noiva no título, vestido abaixo):
  // é o enriquecimento relacional da Onda 2 chegando à tela.
  await expect(page.getByRole("heading", { name: "E2E Noiva Playwright" })).toBeVisible();
  await expect(page.getByText("E2E-V900 · E2E Vestido Playwright")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(falhas, `Chamadas de API falharam no detalhe da reserva: ${falhas.join(", ")}`).toEqual([]);
});

test("'Agendar prova' da reserva chega ao formulário já preenchido", async ({ page }) => {
  await page.goto("/reservas/e2e-bloqueio-1");
  await page.getByRole("link", { name: "Agendar prova" }).click();

  // O deep-link carrega ?noiva=&tipo=PROVA&reserva=: o formulário precisa ler os
  // params, senão o contexto da reserva se perde e a noiva é reescolhida à mão.
  await expect(page).toHaveURL(/tipo=PROVA/);
  await expect(page.getByRole("heading", { name: "Agendar" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Noiva" })).toHaveText("E2E Noiva Playwright");
  await expect(page.getByRole("button", { name: "Prova", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
