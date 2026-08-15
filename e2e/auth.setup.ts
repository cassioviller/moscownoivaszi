import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, loginViaUI, fecharTourDoAcesso } from "./helpers";

/**
 * Autentica o superadmin pela UI e persiste o storageState (cookie de sessão
 * com a loja já selecionada) para os demais specs.
 *
 * NOTA DE AUDITORIA: após clicar na loja, a SPA NÃO navega ao dashboard
 * (selecionar-loja.tsx não invalida o getMe; o AppLayout devolve a rota para
 * /selecionar-loja — ver 02-selecionar-loja.spec.ts). O contorno aqui é o
 * mesmo da usuária real: recarregar a página (goto /dashboard).
 */
setup("autentica admin e seleciona a loja", async ({ page }) => {
  const estado = lerEstado();

  await loginViaUI(page, estado.adminEmail, estado.senha);
  await expect(page).toHaveURL(/selecionar-loja|dashboard/, { timeout: 10_000 });

  /**
   * S-O144 — SEMPRE pela tela de seleção, e SEMPRE pela chave. Há duas
   * "Moscow Noivas" para o admin desde o seed real (bb03a0f7) — a de dev e a
   * de demonstração dos manuais —, e o setup antigo clicava
   * `getByText(nome).first()`: quando a demo renasceu (15/08, 21:27) e passou
   * a vir primeiro, o storageState que TODOS os specs herdam nasceu apontando
   * para ela — 14 vermelhos em 04–13, e o spec 03 passou por ser agnóstico de
   * loja. `loja_ativa_id` mora na SESSÃO, e a sessão é uma só para a suíte.
   */
  await page.goto("/selecionar-loja");
  const selecionou = page.waitForResponse(
    (res) => res.url().includes("/api/auth/selecionar-loja") && res.ok(),
    { timeout: 10_000 },
  );
  await page.getByTestId(`loja-${estado.lojaId}`).click();
  await selecionou;
  // Navegação plena recarrega a sessão com a loja escolhida.
  await page.goto("/dashboard");

  // O tour do acesso (E24) abre sobre o dashboard na PRIMEIRA entrada do perfil
  // e é modal — sem fechá-lo, nada atrás dele é alcançável e todo spec que
  // depende deste storageState morre no primeiro `click`. Fechar aqui é o que a
  // usuária real faz uma vez; o estado de "já viu" viaja no storageState.
  // Sem fechar o tour (E24) nada atrás dele é clicável, e todo spec que herda
  // este storageState morre no primeiro clique.
  await fecharTourDoAcesso(page);

  await expect(page.getByRole("heading", { name: /Seu dia/ })).toBeVisible({ timeout: 10_000 });
  await page.context().storageState({ path: path.join(__dirname, ".auth", "admin.json") });
});
