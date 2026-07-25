import { test, expect, type APIRequestContext } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E47: a trilha de auditoria ganha filtro, deep-link e CSV. O setup paga uma
 * conta de verdade — a linha nasce do mesmo caminho que a produção usa, não de
 * um insert — e a tela é cobrada pelo que a contadora faz com ela: estreitar,
 * chegar na entidade e levar a planilha embora.
 */

const MS_POR_DIA = 86_400_000;

async function autenticar(request: APIRequestContext): Promise<void> {
  await request.post(`${API_URL}/api/auth/login`, {
    data: { email: estado.adminEmail, senha: estado.senha },
  });
  await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
}

test.describe("Trilha de auditoria — filtros e CSV (E47)", () => {
  const stamp = Date.now();
  const descricao = `E2E auditoria ${stamp}`;

  test.beforeAll(async ({ request }) => {
    await autenticar(request);

    const conta = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/contas-pagar`, {
      data: {
        tipo: "DESPESA",
        descricao,
        valorPrevisto: 123.45,
        vencimento: new Date(Date.now() + 3 * MS_POR_DIA).toISOString(),
      },
    });
    expect(conta.status(), await conta.text()).toBe(201);

    // Pagar é o que deixa linha na trilha, com o admin como autor. A ação é
    // PAGAMENTO_REGISTRADO desde o A2/E94: as duas portas de pagar (esta, de
    // uma conta, e a multi-conta que a UI usa) eram a MESMA operação com
    // trilhas diferentes — quem consultasse a trilha por conta a pagar só
    // encontrava metade dos pagamentos. Agora a linha é indexada pelo
    // pagamento, que é o fato de caixa, e o detalhe traz as contas que quitou.
    const pago = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contas-pagar/${(await conta.json()).id}/pagar`,
      { data: { data: new Date().toISOString(), valorPago: 123.45, forma: "PIX" } },
    );
    expect(pago.status(), await pago.text()).toBe(200);
  });

  test("filtrar por ação estreita a lista e sobrevive ao compartilhar a URL", async ({ page }) => {
    await page.goto("/financeiro/auditoria");
    await expect(page.getByRole("heading", { name: "Trilha de auditoria" })).toBeVisible();
    await expect(page.getByText(descricao)).toBeVisible();

    await page.getByLabel("Ação").click();
    await page.getByRole("option", { name: "Pagamento registrado" }).click();

    // O filtro vai para a URL: auditoria é tela que se manda por link.
    await expect(page).toHaveURL(/acao=PAGAMENTO_REGISTRADO/);
    await expect(page.getByText(descricao)).toBeVisible();
    await expect(page.getByText("Parcela recebida")).toHaveCount(0);

    // E a URL colada sozinha reconstrói a mesma vista.
    await page.goto("/financeiro/auditoria?acao=PAGAMENTO_REGISTRADO");
    await expect(page.getByText(descricao)).toBeVisible();
  });

  test("filtro sem resultado diz que não achou — não finge trilha vazia", async ({ page }) => {
    await page.goto("/financeiro/auditoria?de=2020-01-01&ate=2020-01-02");
    await expect(page.getByTestId("trilha-vazia")).toContainText("Nenhuma ação bate com esse filtro");
  });

  test("a linha leva à entidade que ela tocou", async ({ page }) => {
    await page.goto("/financeiro/auditoria?acao=PAGAMENTO_REGISTRADO");
    const linha = page.locator("li").filter({ hasText: descricao });
    await linha.getByRole("link", { name: /Ver em contas a pagar/ }).click();
    await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();
  });

  test("o CSV sai com o filtro em vista", async ({ page }) => {
    await page.goto("/financeiro/auditoria?acao=PAGAMENTO_REGISTRADO");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Exportar CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toContain("auditoria");

    const stream = await download.createReadStream();
    const csv = (await new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = [];
      stream.on("data", (p) => partes.push(Buffer.from(p)));
      stream.on("end", () => resolve(Buffer.concat(partes)));
      stream.on("error", reject);
    })).toString("utf-8");

    expect(csv).toContain("Quando,Ação,Autor,Entidade,ID da entidade,Detalhe");
    expect(csv).toContain(descricao);
    // O filtro valeu para a planilha também: nada de outra ação entrou.
    expect(csv).not.toContain("Parcela recebida");
  });
});
