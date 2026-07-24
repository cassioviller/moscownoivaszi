import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros, lerEstado } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Orçamentos", () => {
  test("lista mostra o orçamento existente", async ({ page }) => {
    await page.goto("/orcamentos");
    await expect(page.getByText(/Orçamento/).first()).toBeVisible();
    // Ao menos um card de orçamento renderizado.
    await expect(page.getByText("RASCUNHO").first()).toBeVisible();
  });

  // FALHA ESPERADA no main (achado UX-orcamentos): a lista mostra
  // "Lead: a1b2c3d4" (orcamentos/index.tsx:38) em vez do nome da noiva.
  test("card do orçamento identifica a noiva pelo nome", async ({ page }) => {
    await page.goto("/orcamentos");
    // `.first()`: o banco de dev acumula orçamentos da mesma noiva seedada a
    // cada rodada — um match basta para provar que é o NOME, não o id.
    await expect(
      page.getByText("E2E Noiva Playwright").first(),
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
