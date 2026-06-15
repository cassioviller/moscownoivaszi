import { test, expect } from "@playwright/test";
import { entrarNaLoja, LOJA } from "./helpers";
import { criarParcelaAbertaE2E } from "./fixtures";

// Fluxo de mutação financeiro: dá baixa numa parcela aberta pela UI e confirma que
// ela migra de "Abertas" para "Recebidas".
// Pré-condição via Prisma: Lead + Contrato ATIVO + 1 Parcela PREVISTA (fixture).
// Linha da parcela (financeiro/receber/page.tsx): <li> com a noiva + form inline
//   (aria "Valor recebido" já vem com o previsto, aria "Forma de recebimento", botão
//   "Receber"); sucesso redireciona com ?ok=recebido.
test("receber parcela: registra recebimento e ela migra para Recebidas", async ({ page }) => {
  const nome = `Noiva Receber ${Date.now()}`;
  criarParcelaAbertaE2E(nome);

  await entrarNaLoja(page);
  await page.goto(`/loja/${LOJA}/financeiro/receber`);

  // Escopo na linha da nossa noiva (nome único) — a lista é por-loja e pode ter outras.
  const linha = page.locator("li", { hasText: nome });
  await linha.getByLabel("Forma de recebimento").fill("PIX"); // valor do enum FormaPagamento
  // O valor já vem com o previsto; não mexemos nele.
  await linha.getByRole("button", { name: "Receber" }).click();
  await page.waitForURL(/ok=recebido/);

  // Efeito observável: a parcela paga consta na aba "Recebidas".
  await page.goto(`/loja/${LOJA}/financeiro/receber?filtro=recebidas`);
  await expect(page.getByText(nome)).toBeVisible();
});
