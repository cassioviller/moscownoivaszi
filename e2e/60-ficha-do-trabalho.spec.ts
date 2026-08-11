import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  ajustesTable,
  atendimentosTable,
  leadsTable,
  orcamentosTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL, criarAtendimentoLivre, apagarCabineCriada , diaLocalSP} from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * S-A17 — a ficha de UM trabalho da costureira, de ponta a ponta.
 *
 * A dívida ficou anotada no próprio fecho da S-A17 (`8b9c574`): a ficha
 * `/ajustes/:id` nasceu sem spec E2E. Os três caminhos que ela existe para
 * servir são exatamente os três testes daqui:
 *
 * 1. o DEEP LINK — a API não tem `GET /ajustes/:id` de propósito (a fila
 *    carrega tudo de uma vez), então a ficha pede a MESMA lista da fila; o
 *    link colado numa conversa tem de abrir sozinho;
 * 2. MARCAR FEITO pela ficha — o gesto da fila vive também aqui, e tem de
 *    sobreviver ao recarregar (é escrita, não estado de tela);
 * 3. o ITEM DE ORÇAMENTO que cobra a confecção leva ao TRABALHO, não mais à
 *    fila inteira — numa fila longa "na fila da costureira" era busca a olho.
 */
test.describe("Ficha do trabalho da costureira (S-A17)", () => {
  let leadId: string | null = null;
  let atendimentoId: string | null = null;
  let ajusteId: string | null = null;
  let cabineId: string | null = null;
  let orcamentoId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Noiva Ficha ${Date.now()}` },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    // Cabine própria por execução: o banco do E2E persiste e horário fixo
    // colide (S7/E115). O afterAll a leva embora (S-D25).
    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];
    const cabine = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e60-${Date.now()}` },
    });
    expect(cabine.status(), await cabine.text()).toBe(201);
    cabineId = ((await cabine.json()) as { id: string }).id;

    const atendimento = await criarAtendimentoLivre(request, estado.lojaId, {
      leadId,
      cabineId,
      vendedoraId: vendedoras[0]!.usuarioId,
      ymd: diaLocalSP(),
    });
    atendimentoId = atendimento.id;

    const confeccao = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/ajustes`, {
      data: {
        atendimentoId,
        descricao: "E2E Bolero de renda da ficha",
        tipo: "CONFECCAO",
        custo: 380,
      },
    });
    expect(confeccao.status(), await confeccao.text()).toBe(201);
    ajusteId = ((await confeccao.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    // O item do orçamento sai no CASCADE do orçamento; o resto na ordem das
    // FKs, a mesma grafia do spec 57.
    if (orcamentoId) await db.delete(orcamentosTable).where(eq(orcamentosTable.id, orcamentoId));
    if (ajusteId) await db.delete(ajustesTable).where(eq(ajustesTable.id, ajusteId));
    if (atendimentoId)
      await db.delete(atendimentosTable).where(eq(atendimentosTable.id, atendimentoId));
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    await apagarCabineCriada(cabineId);
  });

  test("o deep link abre a ficha sozinho — sem passar pela fila", async ({ page }) => {
    await page.goto(`/ajustes/${ajusteId}`);

    // O título é a descrição do trabalho, e a natureza vem dita por extenso:
    // é a distinção que faz a costureira saber se corta ou conserta.
    await expect(page.getByRole("heading", { name: "E2E Bolero de renda da ficha" })).toBeVisible();
    await expect(page.getByText("Peça nova, feita para a noiva")).toBeVisible();
    // E155: confecção tem custo — é o que o item do orçamento cobra.
    await expect(page.getByText("R$ 380,00")).toBeVisible();
  });

  test("marcar feito pela ficha escreve — e sobrevive ao recarregar", async ({ page }) => {
    await page.goto(`/ajustes/${ajusteId}`);
    await expect(page.getByText("Pendente", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Marcar feito" }).click();
    await expect(page.getByText("Concluído", { exact: true })).toBeVisible();

    // A prova é a escrita, não o estado da tela.
    await page.reload();
    await expect(page.getByText("Concluído", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reabrir" })).toBeVisible();

    // Devolve o estado: o teste do deep link não depende de ordem, mas a
    // fixture não deve terminar diferente de como nasceu.
    await page.getByRole("button", { name: "Reabrir" }).click();
    await expect(page.getByText("Pendente", { exact: true })).toBeVisible();
  });

  test("o item de orçamento que cobra a confecção leva ao trabalho, não à fila", async ({
    page,
    request,
  }) => {
    const orcamento = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos`, {
      data: { leadId },
    });
    expect(orcamento.status(), await orcamento.text()).toBe(201);
    orcamentoId = ((await orcamento.json()) as { id: string }).id;

    // E155: só item AJUSTE cobra trabalho da fila, e o trabalho é DESTA noiva.
    const item = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${orcamentoId}/itens`,
      {
        data: {
          tipo: "AJUSTE",
          ajusteId,
          descricao: "E2E Bolero de renda da ficha",
          valorUnitario: 600,
        },
      },
    );
    expect(item.status(), await item.text()).toBe(201);

    await page.goto(`/orcamentos/${orcamentoId}`);
    await page.getByTestId("link-item-confeccao").click();

    // Aterrissa na FICHA do trabalho — não em /ajustes?recorte=todos.
    await expect(page).toHaveURL(new RegExp(`/ajustes/${ajusteId}$`));
    await expect(page.getByRole("heading", { name: "E2E Bolero de renda da ficha" })).toBeVisible();
  });
});
