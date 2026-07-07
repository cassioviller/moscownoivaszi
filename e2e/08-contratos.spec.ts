import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros, lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Contratos", () => {
  test("lista mostra o contrato existente", async ({ page }) => {
    test.skip(!estado.contratoId, "sem contrato seedado");
    await page.goto("/contratos");
    await expect(page.getByText(/Contrato #/).first()).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C4): botão "Novo Contrato" sem handler
  // (contratos/index.tsx:17-20).
  test("botão Novo Contrato leva a um fluxo de criação", async ({ page }) => {
    await page.goto("/contratos");
    await page.getByRole("button", { name: "Novo Contrato" }).click();
    const abriuDialog = await page.getByRole("dialog").isVisible().catch(() => false);
    const navegou = !page.url().endsWith("/contratos");
    expect(
      abriuDialog || navegou,
      "Novo Contrato deveria abrir formulário ou navegar (botão sem handler em contratos/index.tsx:17)",
    ).toBe(true);
  });

  // FALHA ESPERADA no main (achado C2): o detalhe chama GET /api/contratos/{id};
  // o servidor só tem /api/lojas/{lojaId}/contratos/{id} → 404 → "não encontrado"
  // para um contrato que existe. Comprovado também por probe direto na API.
  test("detalhe do contrato carrega valor e parcelas", async ({ page }) => {
    test.skip(!estado.contratoId, "sem contrato seedado");
    const erros = coletarErrosApi(page);
    await page.goto(`/contratos/${estado.contratoId}`);
    await expect(
      page.getByText("Detalhes Financeiros"),
      `Detalhe do contrato deveria abrir (bug C2 — URL divergente):\n${resumoErros(erros)}`,
    ).toBeVisible();
  });

  test("PROBE API: a URL que o frontend chama e a que o servidor expõe divergem (C2)", async ({ request }) => {
    const login = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    expect(login.ok()).toBeTruthy();
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    test.skip(!estado.contratoId, "sem contrato seedado");
    // O que o cliente gerado chama:
    const urlFrontend = await request.get(`${API_URL}/api/contratos/${estado.contratoId}`);
    // O que o servidor realmente expõe:
    const urlServidor = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/contratos/${estado.contratoId}`);

    expect(
      urlFrontend.status(),
      `Frontend chama /api/contratos/{id} → ${urlFrontend.status()}; servidor expõe /api/lojas/{lojaId}/contratos/{id} → ${urlServidor.status()}. As duas deveriam coincidir.`,
    ).toBe(urlServidor.status());
  });
});
