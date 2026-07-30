import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, vestidosTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E42: o form de edição ganha "tirar de linha / reativar" — antes o status do
 * vestido não era editável em tela nenhuma, apesar de a disponibilidade já
 * tratar inativo como indisponível.
 */
test.describe("Vestido — tirar de linha (E42)", () => {
  let vestidoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const stamp = Date.now();
    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { codigo: `STAT${stamp}`, nome: `Vestido Status ${stamp}`, precoBase: 3000 },
    });
    expect(criado.status(), await criado.text()).toBe(201);
    vestidoId = (await criado.json()).id;
  });

  test.afterAll(async () => {
    // O banco do e2e persiste: sem isto, cada run deixava mais um vestido fora
    // de linha no acervo. Sai só o que este spec criou.
    if (vestidoId) await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
  });

  test("tirar de linha e reativar alterna a situação", async ({ page }) => {
    await page.goto(`/vestidos/${vestidoId}/editar`);

    const botao = page.getByTestId("toggle-status-vestido");
    await expect(botao).toHaveText("Tirar de linha");
    await expect(page.getByTestId("situacao-vestido")).toContainText("Ativo");

    await botao.click();

    await expect(botao).toHaveText("Reativar");
    await expect(page.getByTestId("situacao-vestido")).toContainText("Fora de linha");
  });
});
