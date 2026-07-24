import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL, arrastar } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Funil kanban das noivas (E27) — o arraste entre colunas.
 *
 * O spec cria a própria noiva em NOVO: arrastar é destrutivo (a etapa só
 * avança, nunca volta), então reusar a noiva do seed global faria o segundo
 * `pnpm test:e2e` rodar contra um estado diferente do primeiro.
 */

test.describe("Funil kanban das noivas", () => {
  let leadId: string;
  const nome = `E2E Funil ${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: nome },
    });
    expect(criado.status(), await criado.text()).toBe(201);
    leadId = (await criado.json()).id;
  });

  test("o alternador mostra as colunas do funil", async ({ page }) => {
    await page.goto("/noivas");
    await page.getByTestId("toggle-vista-funil").click();

    await expect(page.getByTestId("funil-noivas")).toBeVisible();
    await expect(page.getByTestId("coluna-funil-NOVO")).toBeVisible();
    await expect(page.getByTestId("coluna-funil-PERDIDO")).toBeVisible();
    // A noiva recém-criada nasce em NOVO.
    await expect(page.getByTestId(`card-funil-${leadId}`)).toBeVisible();
  });

  test("arrastar o card avança a etapa e a mudança persiste", async ({ page }) => {
    await page.goto("/noivas");
    await page.getByTestId("toggle-vista-funil").click();

    const card = page.getByTestId(`card-funil-${leadId}`);
    await expect(card).toBeVisible();

    await arrastar(
      page,
      card.getByRole("button", { name: /Arrastar/ }),
      page.getByTestId("coluna-funil-ATENDIMENTO_AGENDADO"),
    );

    // O card passa a viver na coluna de destino.
    await expect(
      page.getByTestId("coluna-funil-ATENDIMENTO_AGENDADO").getByTestId(`card-funil-${leadId}`),
    ).toBeVisible();

    // E a etapa é do servidor, não da tela: recarregar confirma.
    await page.reload();
    await page.getByTestId("toggle-vista-funil").click();
    await expect(
      page.getByTestId("coluna-funil-ATENDIMENTO_AGENDADO").getByTestId(`card-funil-${leadId}`),
    ).toBeVisible();
  });

  test("soltar em Perdido pede o motivo antes de mover", async ({ page, request }) => {
    // Noiva própria e já numa etapa tardia: PERDIDO é a última das 11 colunas, e
    // um arraste desde NOVO cruzaria ~3000px de rolagem horizontal — o
    // auto-scroll do dnd-kit resolve isso para a mão humana, mas não para 20
    // passos sintéticos de mouse. A partir de uma coluna vizinha o gesto cabe
    // na viewport, e o que está sob teste (o diálogo interceptar o drop) é o
    // mesmo de qualquer origem.
    const criada = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `${nome} tardia` },
    });
    const tardiaId = (await criada.json()).id;
    await request.patch(`${API_URL}/api/lojas/${estado.lojaId}/leads/${tardiaId}`, {
      data: { etapa: "DEVOLVIDO" },
    });

    await page.goto("/noivas");
    await page.getByTestId("toggle-vista-funil").click();

    const colunaPerdido = page.getByTestId("coluna-funil-PERDIDO");
    await colunaPerdido.scrollIntoViewIfNeeded();

    const card = page.getByTestId(`card-funil-${tardiaId}`);
    await expect(card).toBeVisible();

    await arrastar(page, card.getByRole("button", { name: /Arrastar/ }), colunaPerdido);

    // O diálogo intercepta: sem motivo a rota devolveria 422.
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toBeVisible();

    await page.getByTestId("select-motivo-perda-funil").click();
    await page.getByRole("option", { name: "Preço" }).click();
    await page.getByTestId("button-confirmar-perda-funil").click();

    await expect(
      page.getByTestId("coluna-funil-PERDIDO").getByTestId(`card-funil-${tardiaId}`),
    ).toBeVisible();

    // O motivo chegou ao banco — o diálogo não é enfeite, é o que evita o 422.
    const conferido = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/leads/${tardiaId}`,
    );
    expect((await conferido.json()).perdidaMotivo).toBe("PRECO");
  });
});
