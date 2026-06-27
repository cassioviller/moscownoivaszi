import { test, expect } from "@playwright/test";
import { entrarNaLoja, LOJA } from "./helpers";
import { criarNoivaE2E } from "./fixtures";

// Fluxo de mutação: gera um contrato em branco PELA UI (a partir de uma noiva
// recém-criada, sem contratos), gera o plano de parcelas e cancela o contrato.
// Efeito observável verificado: status "Cancelado" + parcelas "· cancelada".
//
// Notas de fidelidade ao código real (contratos/[contratoId]/page.tsx):
//   - "Gerar contrato em branco" só aparece com 0 contratos — a fixture cria só o Lead.
//   - O form de gerar plano tem `primeiroVencimento` REQUIRED: precisa ser preenchido,
//     senão o submit é bloqueado pela validação de HTML.
//   - O cancelamento vive num <details><summary>Cancelar contrato</summary>; o motivo é
//     OPCIONAL (não precisa preencher). Default de destinoPago = "manter".
//   - Redirect de cancelar = ?ok=cancelado.
test("fechar contrato: gera, parcela e cancela (parcelas viram canceladas)", async ({ page }) => {
  const nome = `Noiva Contrato ${Date.now()}`;
  const leadId = await criarNoivaE2E(nome); // pré-condição via Prisma (subprocess)

  await entrarNaLoja(page);
  await page.goto(`/loja/${LOJA}/noivas/${leadId}`);

  // Gera o contrato em branco → redireciona para o detalhe.
  await page.getByRole("button", { name: "Gerar contrato em branco" }).click();
  await page.waitForURL(new RegExp(`/loja/${LOJA}/contratos/`));

  // Gera 3 parcelas (contrato nasce sem parcelas). `primeiroVencimento` é required.
  await page.getByLabel("Número de parcelas").fill("3");
  await page.getByLabel("Primeiro vencimento").fill("2030-01-10");
  await page.getByRole("button", { name: "Gerar" }).click();
  await expect(page.locator("text=/vence/").first()).toBeVisible();

  // Cancela mantendo o que entrou no caixa (default "manter"; motivo opcional).
  await page.locator('summary:has-text("Cancelar contrato")').click(); // abre o <details>
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await page.waitForURL(/ok=cancelado/);

  // Efeito observável: status Cancelado + parcelas canceladas.
  // exact: o badge é exatamente "Cancelado"; sem isso casaria também o toast
  // "✓ Contrato cancelado." (strict mode violation).
  await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
  await expect(page.locator("text=/· cancelada/").first()).toBeVisible();
});
