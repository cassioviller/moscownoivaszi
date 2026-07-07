import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Comissões", () => {
  test("página abre sem crash", async ({ page }) => {
    await page.goto("/comissoes");
    await expect(page.getByText("Regras de Comissão")).toBeVisible();
    await expect(page.getByText("Fechamentos")).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C9-faixas): a faixa de comissão existe no
  // banco (seed: 5% desde 0), mas a tela não a exibe em lugar nenhum — a
  // página consome "regras" (tabela vazia) e ignora as faixas.
  test("faixas de comissão configuradas aparecem na tela", async ({ page }) => {
    await page.goto("/comissoes");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText(/5\s*%|Faixa/i).first(),
      "A faixa 5% (seedada) deveria estar visível (comissoes/index.tsx não consome faixas)",
    ).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C9c): GET /comissao/faixas responde 500 —
  // o schema de resposta (minAcumulado/regraId) não bate com o banco
  // (minimoVenda/percentual) e o parse Zod explode no servidor.
  test("PROBE API: GET /comissao/faixas responde 200", async ({ request }) => {
    const login = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    expect(login.ok()).toBeTruthy();
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const faixas = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/comissao/faixas`);
    expect(
      faixas.status(),
      `GET faixas → ${faixas.status()} (spec×banco divergem em comissao.ts — ZodError 500)`,
    ).toBe(200);
  });
});
