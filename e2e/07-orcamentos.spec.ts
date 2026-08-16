import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros, lerEstado } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Orçamentos", () => {
  /**
   * E246 (D1 da conferência) — os dois testes abaixo passavam porque a página 1
   * de /orcamentos estava cheia de lixo da MESMA noiva: `e2e-orcamento-1` é o
   * #303 de 303 na ordem da tela, e as posições 1–60 eram 60 RASCUNHOs de
   * `e2e-lead-1` que nenhum spec vivo cria. Em banco virgem passa; em qualquer
   * banco onde outra coisa ocupe 24 linhas antes dela, reprova — a lição que o
   * `05` aprendeu no E124/D2. A BUSCA (o mesmo `input-busca-orcamento` que o
   * `54` usa) mira a noiva da fixture, e o assert deixa de depender da ordem.
   */
  test("lista mostra o orçamento existente", async ({ page }) => {
    await page.goto("/orcamentos");
    await expect(page.getByText(/Orçamento/).first()).toBeVisible();
    await page.getByTestId("input-busca-orcamento").fill("E2E Noiva Playwright");
    // O orçamento da fixture (`e2e-orcamento-1`, RASCUNHO) aparece pela busca.
    await expect(page.locator("a", { hasText: "E2E Noiva Playwright" }).first()).toBeVisible();
    await expect(page.getByText("RASCUNHO").first()).toBeVisible();
  });

  // Era o achado UX-orcamentos: a lista mostrava "Lead: a1b2c3d4" em vez do
  // nome da noiva — fechado; este teste prova o conserto.
  test("card do orçamento identifica a noiva pelo nome", async ({ page }) => {
    await page.goto("/orcamentos");
    await page.getByTestId("input-busca-orcamento").fill("E2E Noiva Playwright");
    await expect(
      page.locator("a", { hasText: "E2E Noiva Playwright" }).first(),
      "Card deveria mostrar o nome da noiva, não o id truncado (orcamentos/index.tsx:38)",
    ).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C4): botão "Novo Orçamento" sem handler
  // (orcamentos/index.tsx:17-20).
  test("botão Novo Orçamento abre formulário", async ({ page }) => {
    await page.goto("/orcamentos");
    await page.getByRole("button", { name: "Novo Orçamento" }).click();
    await expect(
      page.getByRole("dialog"),
      "Novo Orçamento deveria abrir formulário (botão sem handler em orcamentos/index.tsx:17)",
    ).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C2): o detalhe chama GET /api/orcamentos/{id}
  // (cliente gerado) mas o servidor expõe /api/lojas/{lojaId}/orcamentos/{id}
  // → 404 → a tela mostra "não encontrado" para um orçamento que EXISTE.
  test("detalhe do orçamento carrega os itens", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto(`/orcamentos/${estado.orcamentoId}`);
    await expect(
      page.getByText("E2E Item Vestido"),
      `Detalhe deveria listar o item do orçamento (bug C2 — spec×servidor):\n${resumoErros(erros)}`,
    ).toBeVisible();
  });
});
