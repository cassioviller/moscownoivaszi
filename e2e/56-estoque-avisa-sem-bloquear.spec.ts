import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  orcamentosTable,
  orcamentoItensTable,
  leadsTable,
  itensEstoqueTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E154 — a peça de estoque é contada, não reservada, e o excesso AVISA.
 *
 * O que este teste prega, e por quê: o acervo decide disponibilidade por peça e
 * o contrato exige a reserva (E150). O saiote existe dez, iguais, e reservar "o
 * nº 7" não significa nada — a régua dele é contagem por dia. E quando a
 * contagem estoura, a tela diz o número e deixa fechar: saiote é substituível,
 * e recusar uma venda de R$ 4.000 por causa de uma anágua é um defeito, não uma
 * proteção.
 *
 * Aqui a loja tem UM saiote e o orçamento pede DOIS para o mesmo casamento.
 */
test.describe("Estoque — avisa sem bloquear (E154)", () => {
  let orcamentoId: string | null = null;
  let leadId: string | null = null;
  let itemEstoqueId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
  });

  test.afterAll(async () => {
    // O banco do E2E persiste entre execuções: o que este spec cria, ele tira.
    if (orcamentoId) {
      await db.delete(orcamentoItensTable).where(eq(orcamentoItensTable.orcamentoId, orcamentoId));
      await db.delete(orcamentosTable).where(eq(orcamentosTable.id, orcamentoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    if (itemEstoqueId) {
      await db.delete(itensEstoqueTable).where(eq(itensEstoqueTable.id, itemEstoqueId));
    }
  });

  test("a loja tem 1 saiote, o orçamento pede 2, e a tela avisa em vez de travar", async ({
    page,
    request,
  }) => {
    // A peça de estoque, com UMA unidade — e um nome único por execução, que o
    // par (nome, tamanho) é único por loja e o banco do E2E não é limpo.
    const nome = `E2E Saiote ${Date.now()}`;
    const estoque = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/itens-estoque`, {
      data: { nome, quantidade: 1, preco: 80 },
    });
    expect(estoque.status(), await estoque.text()).toBe(201);
    itemEstoqueId = ((await estoque.json()) as { id: string }).id;

    // A noiva precisa de DATA: sem dia não há contagem, e a tela não inventa
    // aviso sobre "algum dia".
    const casamento = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Noiva Estoque ${Date.now()}`, casamentoData: casamento.toISOString() },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    const orc = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos`, {
      data: { leadId },
    });
    expect(orc.status(), await orc.text()).toBe(201);
    orcamentoId = ((await orc.json()) as { id: string }).id;

    await page.goto(`/orcamentos/${orcamentoId}`);

    // O tipo existe na tela — um tipo que a interface não oferece é um tipo que
    // não existe (a emenda do E150 aprendeu isso do jeito caro).
    await page.getByLabel("Tipo").click();
    await page.getByRole("option", { name: "Estoque", exact: true }).click();

    // O seletor do estoque é irmão do "Do catálogo", e traz a contagem junto.
    const seletor = page.getByTestId("select-item-estoque");
    await expect(seletor).toBeVisible();
    await seletor.click();
    await page.getByRole("option", { name: new RegExp(nome) }).click();

    // Descrição e valor vieram da peça escolhida.
    await expect(page.getByLabel("Descrição")).toHaveValue(nome);
    await expect(page.getByLabel("Valor (R$)")).toHaveValue("80");

    await page.getByLabel("Qtd").fill("2");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();

    // O item ENTROU — nada foi bloqueado — e o aviso diz o número.
    await expect(page.getByText(nome).first()).toBeVisible();
    const aviso = page.getByTestId("aviso-estoque");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("a loja tem 1");
  });

  test("o saiote está no Estoque, e não no acervo que a noiva folheia", async ({ page }) => {
    await page.goto("/vestidos/estoque");
    await expect(page.getByTestId("lista-estoque")).toBeVisible();

    // A mesma peça, na tela onde a dona conta a arara.
    const linha = page.getByTestId("lista-estoque").getByText(/E2E Saiote/).first();
    await expect(linha).toBeVisible();

    // E não na lista do acervo: são as peças que a vendedora abre com a noiva
    // na cabine, e uma anágua ali seria ruído.
    await page.goto("/vestidos");
    await expect(page.getByText("E2E Vestido Playwright")).toBeVisible();
    await expect(page.getByText(/E2E Saiote/)).toHaveCount(0);
  });
});
