import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros, lerEstado } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Vestidos", () => {
  test("catálogo lista os vestidos existentes sem erros de API", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/vestidos");
    await expect(page.getByText("E2E Vestido Playwright")).toBeVisible();
    await expect(page.getByText("E2E-V900")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(erros, `Listagem não deveria gerar erros de API:\n${resumoErros(erros)}`).toEqual([]);
  });

  test("cadastrar vestido pelo dialog funciona de ponta a ponta", async ({ page }) => {
    await page.goto("/vestidos");
    await page.getByRole("button", { name: "Novo Vestido" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const codigo = `E2E-${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Código").fill(codigo);
    await page.getByLabel("Nome").first().fill("Vestido Criado Pelo Teste");
    await page.getByLabel(/Preço/).fill("3500");
    await page.getByRole("dialog").getByRole("button", { name: /Cadastrar|Salvar/ }).click();

    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(codigo)).toBeVisible();
  });

  test("detalhe do vestido abre com nome e preço", async ({ page }) => {
    await page.goto(`/vestidos/${estado.vestidoId}`);
    await expect(page.getByText("E2E Vestido Playwright")).toBeVisible();
    await expect(page.getByText(/4\.?200/)).toBeVisible();
  });

  // FALHA ESPERADA no main (achado UX-vestidos): o card exibe o valor cru do
  // banco ("ativo", vestidos/index.tsx:226) em vez de um rótulo tratado; e o
  // catálogo não tem busca nem indicação de disponibilidade por data.
  test("status do vestido é exibido com rótulo tratado", async ({ page }) => {
    await page.goto("/vestidos");
    await expect(page.getByText("E2E Vestido Playwright")).toBeVisible();
    await expect(
      page.getByText("ativo", { exact: true }).first(),
      "Badge mostra o enum cru 'ativo' — deveria ser rótulo tratado ('Ativo')",
    ).not.toBeVisible();
  });

  /**
   * E149 — a cor deixou de ser texto livre e virou atributo do catálogo.
   *
   * O que este teste prega, e por quê: o filtro dedicado de cor derivava as
   * opções dos valores DIGITADOS (`new Set` sobre `v.cor`, sem normalizar) e
   * comparava com `!==`, então "Verde", "verde" e "VERDE" viravam três entradas
   * no dropdown, cada uma com um pedaço do acervo. Como atributo, a cor é
   * filtrada por id de opção — grafia não entra na conta. O vestido do seed
   * (`E2E-V900`, cor "Marfim") tem o par `(Cor, Marfim)` desde o E188.
   *
   * **S-O89/E190 — ele afirmava o que passa com o filtro DESLIGADO.** A versão
   * anterior escolhia "Marfim" e afirmava que a peça marfim **continuava**
   * visível: uma asserção que o `toBeVisible` fecha no primeiro poll e que a
   * lista inteira satisfaz. Medido: apagado o laço do par `(atributoId,
   * opcaoId)` de `vestidos/index.tsx:255`, a suíte deu **7 passed** — verde
   * sobre o recorte que não existe mais. É a regra 34, e o conserto é o dela:
   * a metade que prega é a NEGATIVA, e ela vem primeiro.
   */
  test("a cor filtra pelo catálogo, e não por texto digitado", async ({ page }) => {
    await page.goto("/vestidos");
    await expect(page.getByText("E2E Vestido Playwright")).toBeVisible();

    // A cor não tem mais seletor próprio: é um dos atributos, atrás de "Mais
    // filtros" (E135/D8). O testid termina na chave derivada do seed, então o
    // id da loja não entra no teste.
    await page.getByTestId("botao-mais-filtros").click();
    const filtroCor = page.locator('[data-testid$="-atributo-cor"]');
    await expect(filtroCor).toBeVisible();

    // A peça é marfim: escolher OUTRA cor tem de tirá-la da lista. Esta é a
    // asserção que só passa com o recorte por par `(atributoId, opcaoId)`
    // aplicado de verdade — e a única que espera a lista mudar antes de julgar.
    await filtroCor.click();
    await page.getByRole("option", { name: "Branco", exact: true }).click();
    await expect(page.getByText("E2E Vestido Playwright")).toHaveCount(0);

    // E a volta: com a cor DELA, ela reaparece. Filtrado por id de opção,
    // nenhuma grafia foi comparada para isso acontecer — e o vestido sem o par
    // no banco (o estado da S-O73 numa instalação nova) não voltaria aqui.
    await filtroCor.click();
    await page.getByRole("option", { name: "Marfim", exact: true }).click();
    await expect(page.getByText("E2E Vestido Playwright")).toBeVisible();
  });

  test("a ficha do vestido mostra a cor entre as características", async ({ page }) => {
    await page.goto(`/vestidos/${estado.vestidoId}`);
    await expect(page.getByText("Características")).toBeVisible();
    await expect(page.getByText(/Cor:\s*Marfim/)).toBeVisible();
  });
});
