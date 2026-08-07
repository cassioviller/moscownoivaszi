import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E81 (fiscal do E70+E76+E80): a matriz personaliza e RESTAURA o padrão; o
 * perfil do sistema é intocável na tela (flag, não nome — E80); e o console
 * superadmin consolida a rede numa tabela.
 */
test.describe("Permissões: personalizar e restaurar padrão", () => {
  test.afterAll(async ({ request }) => {
    // Garante a loja de volta ao padrão mesmo se o teste falhar no meio.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const perfis = await request.get(`${API_URL}/api/admin/perfis`);
    const vendedora = (await perfis.json()).find(
      (p: { nome: string }) => p.nome === "Vendedora",
    );
    if (vendedora) {
      await request.delete(
        `${API_URL}/api/admin/lojas/${estado.lojaId}/overrides/${vendedora.id}`,
      );
    }
  });

  test("personalizar cria o override; restaurar padrão o remove", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/permissoes`);

    const cardVendedora = page.locator("div", { has: page.getByText("Vendedora", { exact: true }) });
    await expect(page.getByRole("heading", { name: "Permissões" })).toBeVisible();

    // Estado inicial: padrão — sem botão de restaurar.
    await expect(page.getByTestId("restaurar-padrao-Vendedora")).not.toBeVisible();

    // Liga "Financeiro — Ver" para a Vendedora e salva.
    const checkbox = page.getByLabel("Vendedora — Financeiro — Ver");
    await checkbox.click();
    await page
      .locator("div.space-y-4", { has: checkbox })
      .getByRole("button", { name: "Salvar" })
      .click();
    await expect(page.getByText("Permissões salvas").first()).toBeVisible();

    // Agora está personalizado — o badge e o botão dizem.
    await expect(page.getByText("Personalizado").first()).toBeVisible();
    const restaurar = page.getByTestId("restaurar-padrao-Vendedora");
    await expect(restaurar).toBeVisible();

    // Restaurar: volta ao modelo global.
    // E10/E99: restaurar passou a confirmar — a personalização desta loja é
    // apagada e não é versionada, então o diálogo nomeia o PERFIL.
    await restaurar.click();
    await expect(page.getByText("Restaurar o padrão de Vendedora?")).toBeVisible();
    await page.getByRole("button", { name: "Restaurar padrão", exact: true }).click();
    await expect(page.getByText("Padrão restaurado").first()).toBeVisible();
    await expect(page.getByTestId("restaurar-padrao-Vendedora")).not.toBeVisible();
    void cardVendedora;
  });

  test("o perfil do sistema é readonly na tela — flag, não nome (E80)", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/permissoes`);
    await expect(page.getByText("Acesso total — perfil do sistema")).toBeVisible();
    // O card do Admin não oferece Salvar; as caixas estão travadas.
    const caixaAdmin = page.getByLabel("Admin — Financeiro — Ver");
    await expect(caixaAdmin).toBeDisabled();
  });
});

test.describe("Console superadmin: a rede numa tela (E76)", () => {
  test("o consolidado responde com uma linha por loja", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    const res = await request.get(`${API_URL}/api/admin/consolidado`);
    expect(res.status()).toBe(200);
    const linhas = await res.json();
    const minha = linhas.find((l: { lojaId: string }) => l.lojaId === estado.lojaId);
    expect(minha).toBeTruthy();
    expect(typeof minha.recebidoNoMes).toBe("number");
  });
});

test.describe("Perfis globais: criar pela tela (S-D36)", () => {
  const nomePerfil = `E2E Perfil ${Date.now()}`;

  test.afterAll(async ({ request }) => {
    // O spec apaga o que criou (S-D45): o DELETE /admin/perfis existe e o
    // perfil de teste nasce sem vínculo nenhum.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    const perfis = await request.get(`${API_URL}/api/admin/perfis`);
    const criado = (await perfis.json()).find((p: { nome: string }) => p.nome === nomePerfil);
    if (criado) await request.delete(`${API_URL}/api/admin/perfis/${criado.id}`);
  });

  test("o botão que faltava: o perfil nasce pela tela, sem acesso nenhum", async ({ page }) => {
    // S-D36: a tela listava e editava, e não tinha por onde repor — o POST
    // existia no servidor com zero usos no app. Decidido em 2026-08-07.
    await page.goto("/admin/perfis");
    await page.getByTestId("novo-perfil").click();
    await page.getByLabel("Nome do perfil").fill(nomePerfil);
    await page.getByRole("button", { name: "Criar perfil" }).click();

    // O perfil aparece na lista de matrizes — editável, com o nome dado.
    // Por ROLE: o toast de sucesso também carrega o nome (colisão do strict).
    await expect(page.getByRole("heading", { name: nomePerfil })).toBeVisible();

    // E nasce SEM acesso: o servidor confirma tudo desligado.
    const resposta = await page.request.get(`${API_URL}/api/admin/perfis`);
    const criado = (await resposta.json()).find((p: { nome: string }) => p.nome === nomePerfil);
    expect(criado).toBeTruthy();
    for (const acoes of Object.values(criado.acessosModulos as Record<string, { ver: boolean; criar: boolean; editar: boolean }>)) {
      expect(acoes).toEqual({ ver: false, criar: false, editar: false });
    }
  });
});
