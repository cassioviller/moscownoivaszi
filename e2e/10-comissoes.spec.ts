import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * A comissão passou a ser por VENDEDORA e versionada (Onda 4): as faixas vivem
 * dentro de uma regra, não soltas na loja. O seed cria a escada 5%/8% da admin.
 */
test.describe("Comissões", () => {
  test("página abre sem crash", async ({ page }) => {
    await page.goto("/comissoes");
    await expect(page.getByRole("heading", { name: "Comissões" })).toBeVisible();
    await expect(page.getByText("Regras de comissão")).toBeVisible();
  });

  // Regressão do achado C9-faixas: a faixa existia no banco e a tela não a
  // mostrava em lugar nenhum — a página lia "regras" e ignorava as faixas.
  test("a escada configurada aparece na tela", async ({ page }) => {
    const erros: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) erros.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });

    await page.goto("/comissoes");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText(/5\s*%/).first(),
      "A faixa de 5% (seedada) deveria estar visível na escada da vendedora",
    ).toBeVisible();
    await expect(page.getByText(/8\s*%/).first()).toBeVisible();
    expect(erros, `Comissões não deveria gerar erros de API: ${erros.join(", ")}`).toEqual([]);
  });

  // Regressão do achado C9c: a resposta de faixas divergia do banco e o parse
  // Zod explodia em 500. Hoje as faixas vêm aninhadas na regra.
  test("PROBE API: GET /comissao/regras responde 200 com as faixas aninhadas", async ({ request }) => {
    const login = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    expect(login.ok()).toBeTruthy();
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const res = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/comissao/regras`);
    expect(res.status(), `GET regras → ${res.status()}`).toBe(200);

    const regras = await res.json();
    expect(regras.length).toBeGreaterThanOrEqual(1);
    const comFaixas = regras.find((r: { faixas: unknown[] }) => r.faixas.length > 0);
    expect(comFaixas, "a regra seedada deveria trazer as faixas aninhadas").toBeTruthy();
    expect(comFaixas.faixas[0]).toHaveProperty("minAcumulado");
    expect(comFaixas.vendedoraId).toBeTruthy();
  });

  test("PROBE API: preview da competência responde 200", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const res = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/comissao/preview?competencia=2025-03`,
    );
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
