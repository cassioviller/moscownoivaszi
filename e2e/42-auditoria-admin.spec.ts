import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, usuariosTable } from "../lib/db/src/index";
import { lerEstado, sessaoViaAPI, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E56: administração deixa rastro, e a permissão passa a valer NA HORA.
 *
 * As duas metades se provam na mesma jornada: o admin remove um membro que
 * está com a sessão viva, a sessão dele morre no mesmo instante, e a ação
 * aparece na trilha — que antes era 100% financeira.
 */
test.describe("Auditoria de administração (E56)", () => {
  const stamp = Date.now();
  const email = `e2e-membro-${stamp}@teste.local`;
  const senha = "senha-e2e-123456";
  let usuarioId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const perfis = await request.get(`${API_URL}/api/admin/perfis`);
    expect(perfis.status()).toBe(200);
    const perfil = (await perfis.json())[0];

    const membro = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/equipe`, {
      data: { nome: `E2E Membro ${stamp}`, email, senha, perfilId: perfil.id },
    });
    expect(membro.status(), await membro.text()).toBe(201);
    usuarioId = (await membro.json()).usuarioId;
  });

  test.afterAll(async () => {
    if (usuarioId) await db.delete(usuariosTable).where(eq(usuariosTable.id, usuarioId));
  });

  test("remover o membro derruba a sessão dele e aparece na trilha", async ({ page, request }) => {
    // A membro está dentro, com sessão viva. E57: a senha foi escolhida pelo
    // admin, então o sistema a leva à troca antes de qualquer tela — para
    // este teste basta a SESSÃO valer (a página de troca é autenticada).
    await sessaoViaAPI(page, email, senha, estado.lojaId);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/trocar-senha/);

    // O admin a remove da equipe.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const remocao = await request.delete(`${API_URL}/api/lojas/${estado.lojaId}/equipe/${usuarioId}`);
    expect(remocao.status()).toBe(204);

    // A aba dela para de valer AGORA — não na próxima expiração de sessão.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    // E a ação está na trilha, que antes era 100% financeira.
    const trilha = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/auditoria?acao=MEMBRO_REMOVIDO`,
    );
    expect(trilha.status()).toBe(200);
    const linha = (await trilha.json()).find(
      (l: { entidadeId: string }) => l.entidadeId === usuarioId,
    );
    expect(linha).toBeTruthy();
    expect(linha.entidade).toBe("usuario");
  });

  test("a trilha na tela oferece o filtro das ações de administração", async ({ page }) => {
    await page.goto("/financeiro/auditoria?acao=MEMBRO_REMOVIDO");
    await expect(page.getByRole("heading", { name: "Trilha de auditoria" })).toBeVisible();
    // O rótulo humano vem do espelho servidor/tela — se um lado esquecer a
    // ação nova, aqui apareceria o código cru.
    await expect(page.getByText("Membro removido").first()).toBeVisible();
  });
});
