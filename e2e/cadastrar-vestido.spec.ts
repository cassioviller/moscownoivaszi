import { test, expect } from "@playwright/test";
import { entrarNaLoja, LOJA } from "./helpers";

// Rota real: src/app/(app)/loja/[lojaId]/vestidos/novo — o grupo (app) não aparece na URL.
// Form: src/app/(app)/loja/[lojaId]/vestidos/vestido-form.tsx
//   inputs required: codigo, nome, precoBase (parsePreco aceita "2500,00").
// criarVestidoAction redireciona para /loja/<loja>/vestidos?ok=1 ao salvar.
test("cadastrar vestido: cria pela UI e aparece no acervo", async ({ page }) => {
  const sufixo = Date.now();
  const codigo = `E2E-${sufixo}`;
  const nome = `Vestido E2E ${sufixo}`;

  await entrarNaLoja(page);

  await page.goto(`/loja/${LOJA}/vestidos/novo`);
  await page.fill('input[name="codigo"]', codigo);
  await page.fill('input[name="nome"]', nome);
  await page.fill('input[name="precoBase"]', "2500,00");
  // Clicar pelo NOME do botão: o Topbar do layout (app) tem um submit de logout
  // ("Sair") antes do <main>, então um seletor genérico clicaria no botão errado.
  await page.getByRole("button", { name: "Cadastrar vestido" }).click();

  // Server action redireciona para a lista com ?ok=1 quando salva com sucesso.
  await page.waitForURL((u) => u.pathname.endsWith(`/loja/${LOJA}/vestidos`));

  await page.goto(`/loja/${LOJA}/vestidos`);
  // O código aparece em 2 lugares no card (badge + rodapé) → .first() evita strict mode.
  await expect(page.getByText(codigo).first()).toBeVisible();
});
