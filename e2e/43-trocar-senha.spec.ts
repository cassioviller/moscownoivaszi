import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, usuariosTable } from "../lib/db/src/index";
import { lerEstado, sessaoViaAPI, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E57: a senha que o colega escolheu por mim. Quem entra com senha definida por
 * outra pessoa não chega a lugar nenhum antes de trocá-la — e depois de trocar,
 * o sistema abre normalmente.
 */
test.describe("Troca de senha forçada (E57)", () => {
  const stamp = Date.now();
  const email = `e2e-novato-${stamp}@teste.local`;
  const senhaDoAdmin = "senha-do-admin-1";
  const minhaSenha = "senha-escolhida-1";
  let usuarioId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const perfis = await request.get(`${API_URL}/api/admin/perfis`);
    const perfil = (await perfis.json())[0];
    const membro = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/equipe`, {
      data: { nome: `E2E Novato ${stamp}`, email, senha: senhaDoAdmin, perfilId: perfil.id },
    });
    expect(membro.status(), await membro.text()).toBe(201);
    usuarioId = (await membro.json()).usuarioId;
  });

  test.afterAll(async () => {
    if (usuarioId) await db.delete(usuariosTable).where(eq(usuariosTable.id, usuarioId));
  });

  test("o sistema fica trancado até a senha ser trocada", async ({ page }) => {
    await sessaoViaAPI(page, email, senhaDoAdmin, estado.lojaId);

    // Qualquer porta leva à troca — não é um aviso que dá para ignorar.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/trocar-senha/);
    const card = page.getByTestId("trocar-senha");
    await expect(card).toContainText("Escolha a sua senha");
    // A tela DIZ por que está cobrando, em vez de só exigir.
    await expect(card).toContainText("essa pessoa consegue entrar como você");

    // Errar a confirmação não grava nada.
    await page.locator("#senha-atual").fill(senhaDoAdmin);
    await page.locator("#nova-senha").fill(minhaSenha);
    await page.locator("#confirmacao").fill("digitei-diferente");
    await page.getByRole("button", { name: "Trocar senha" }).click();
    // O toast renderiza o texto duas vezes (visível + anúncio acessível).
    await expect(page.getByText(/confirmação não bate/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/trocar-senha/);

    // Agora certo: a troca libera o sistema.
    await page.locator("#confirmacao").fill(minhaSenha);
    await page.getByRole("button", { name: "Trocar senha" }).click();
    await expect(page).not.toHaveURL(/\/trocar-senha/);
  });

  test("a senha antiga não entra mais; a nova entra", async ({ request }) => {
    const antiga = await request.post(`${API_URL}/api/auth/login`, {
      data: { email, senha: senhaDoAdmin },
    });
    expect(antiga.status()).toBe(401);

    const nova = await request.post(`${API_URL}/api/auth/login`, {
      data: { email, senha: minhaSenha },
    });
    expect(nova.status()).toBe(200);
    // E a pendência sumiu: entrar já leva ao sistema.
    expect((await nova.json()).usuario.precisaTrocarSenha).toBe(false);
  });
});
