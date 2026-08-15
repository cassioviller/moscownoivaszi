import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros } from "./helpers";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Configurações", () => {
  test("página abre", async ({ page }) => {
    await page.goto("/configuracoes");
    await expect(page.getByText(/Configurações|Atributos|Cabines/).first()).toBeVisible();
  });

  // A regra que o seed grava (14 dias, global-setup) tem que aparecer na tela.
  // Prega o conserto do C2 (`2141e96`): cliente e servidor falam a mesma URL de
  // disponibilidade — se o 404 voltasse, os dois asserts abaixo cairiam.
  test("regra de disponibilidade configurada é exibida", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/configuracoes");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Regras de disponibilidade não configuradas."),
      `A regra EXISTE no banco (seed do E2E); a tela negou. Erros de API vistos:\n${resumoErros(erros)}`,
    ).not.toBeVisible();
    await expect(page.getByText(/14 dias/)).toBeVisible();
  });

  // E148: `provaDuracao` é contado em SLOTS de 30 min (`agenda.ts:93` faz
  // `provaDuracao * 30 * 60_000`; o spec 26 registra "o seed usa 2 = 1h"), e a
  // tela mostrava o número cru — "2 min" para uma prova de uma hora, na única
  // tela que existe para explicar a régua. Com o seed padrão, 2 slots = 60 min.
  test("a duração da prova é exibida em minutos, não em slots", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/60 min/)).toBeVisible();
    await expect(page.getByText(/\b2 min\b/)).not.toBeVisible();
  });
});

/**
 * E234 — o que é da loja mora no cadastro da loja. A tela Dados da loja ganhou
 * os sete campos que o instrumento imprime da LOCADORA (cidade/UF do foro, quem
 * assina, o PIX). A cena preenche pela tela, recarrega, e confere que a sessão
 * devolveu o que gravou — o achado da execução foi justamente a sessão não
 * trazer os campos, e o formulário abrir vazio.
 */
test.describe("Configurações — Dados da loja (E234)", () => {
  test("os sete campos do instrumento salvam pela tela e voltam preenchidos", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.waitForLoadState("networkidle");
    // O CPF que não fecha os dígitos avisa e trava o botão (E233, a mesma função do core).
    await page.locator("#loja-representante-cpf").fill("123.456.789-00");
    await expect(page.getByTestId("aviso-cpf-representante-invalido")).toBeVisible();
    await expect(page.getByRole("button", { name: /Salvar dados/ })).toBeDisabled();

    await page.locator("#loja-representante-cpf").fill("333.486.478-27");
    await expect(page.getByTestId("aviso-cpf-representante-invalido")).not.toBeVisible();
    // O cliente que JÁ INSTALOU carrega o CNPJ de exemplo anterior ao E233
    // (12.345.678/0001-99, que não fecha) — o seed é idempotente e não corrige
    // loja existente, e desde o E234 o botão trava também pelo CNPJ. É a P3 no
    // gesto real: a dona corrige o CNPJ ANTES de os sete campos poderem entrar.
    // (Medido no primeiro E2E do E234: 60 s esperando um botão desabilitado.)
    await page.locator("#loja-cnpj").fill("37.771.644/0001-93");
    await page.locator("#loja-cidade").fill("São José dos Campos");
    await page.locator("#loja-uf").fill("SP");
    await page.locator("#loja-representante-nome").fill("Renato Nascimento de Brito");
    await page.locator("#loja-representante-rg").fill("42.909.064-x");
    await page.locator("#loja-pix-chave").fill("23723482805");
    await page.locator("#loja-pix-titular").fill("Karina Shabalina");
    await page.getByRole("button", { name: /Salvar dados/ }).click();
    // `.first()`: o toast e a região viva do leitor de tela trazem a mesma frase
    // (medido: "resolved to 2 elements" no terceiro E2E do dia, e não nos dois antes).
    await expect(page.getByText("Dados da loja salvos").first()).toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#loja-representante-nome")).toHaveValue("Renato Nascimento de Brito");
    await expect(page.locator("#loja-cidade")).toHaveValue("São José dos Campos");
    await expect(page.locator("#loja-pix-chave")).toHaveValue("23723482805");
  });
});

/**
 * P4/E237 — o IPCA informado por competência. A dona digita a variação do
 * mês em Configurações → Índices; a mora das parcelas vencidas passa a
 * corrigir pelos meses cheios. A cena grava um mês, recarrega e vê o número.
 */
test.describe("Configurações — Índices IPCA (E237)", () => {
  test("gravar o IPCA de um mês pela tela, e ele volta gravado", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.waitForLoadState("networkidle");
    const card = page.getByTestId("card-indices-ipca");
    await expect(card).toBeVisible();
    // O mês mais antigo da lista (24 meses atrás) — não colide com nada que a suíte de API grava.
    const linha = card.locator("li[data-testid^='indice-']").last();
    const competencia = (await linha.getAttribute("data-testid"))!.replace("indice-", "");
    await linha.locator("input").fill("0,37");
    await linha.getByRole("button", { name: /Gravar|Corrigir/ }).click();
    await expect(page.getByText(/IPCA de .* gravado/).first()).toBeVisible();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId(`indice-${competencia}-atual`)).toHaveText("0,37%");
  });
});
