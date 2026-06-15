import { test, expect } from "@playwright/test";
import { entrarNaLoja, LOJA } from "./helpers";

// Cria uma noiva pela UI real e confirma que ela aparece na lista de noivas.
// Só "noivaNome" é required no form (noiva-form.tsx) — os demais campos são opcionais.
test("cadastrar noiva: cria pela UI e aparece na lista", async ({ page }) => {
  const nome = `Noiva E2E ${Date.now()}`;

  await entrarNaLoja(page);

  await page.goto(`/loja/${LOJA}/noivas/nova`);
  await page.fill('input[name="noivaNome"]', nome);
  // Clicar pelo NOME do botão do form: o layout (app) tem um <button type="submit">
  // de logout ("Sair") no Topbar, antes do <main> — um seletor genérico clicaria nele.
  await page.getByRole("button", { name: "Adicionar noiva" }).click();

  // criarNoivaAction redireciona para o novo atendimento da noiva recém-criada
  // (actions.ts → /loja/<loja>/atendimentos/novo?noiva=<id>). Esperar esse redirect
  // confirma que a server action concluiu a criação antes de irmos para a lista.
  await page.waitForURL(/\/atendimentos\/novo/);

  await page.goto(`/loja/${LOJA}/noivas`);
  // A noiva nova entra na jornada ativa (filtro padrão "ativas"), então aparece direto.
  // O nome é renderizado no <h2> do card (page.tsx).
  await expect(page.getByText(nome)).toBeVisible();
});
