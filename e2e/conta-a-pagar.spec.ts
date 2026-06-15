import { test, expect } from "@playwright/test";
import { entrarNaLoja, LOJA } from "./helpers";

// Fluxo de mutação sem pré-condição: lança uma conta a pagar (despesa) pela UI e
// confirma que ela aparece na lista "Abertas".
// Form em <details><summary>Lançar despesa</summary> (financeiro/pagar/page.tsx):
//   descricao (required), valorPrevisto (aria "Valor previsto"), vencimento (default hoje).
//   Botão "Lançar"; sucesso redireciona com ?ok=conta.
test("conta a pagar: lança despesa pela UI e ela aparece em Abertas", async ({ page }) => {
  const descricao = `Despesa E2E ${Date.now()}`;

  await entrarNaLoja(page);
  await page.goto(`/loja/${LOJA}/financeiro/pagar`);

  await page.locator('summary:has-text("Lançar despesa")').click(); // abre o <details>
  await page.getByLabel("Descrição").fill(descricao);
  await page.getByLabel("Valor previsto").fill("350,00");
  // vencimento já vem preenchido com a data de hoje.
  await page.getByRole("button", { name: "Lançar" }).click();
  await page.waitForURL(/ok=conta/);

  // O filtro padrão é "Abertas" e a conta nasce PREVISTA → aparece na lista.
  await expect(page.getByText(descricao).first()).toBeVisible();
});
