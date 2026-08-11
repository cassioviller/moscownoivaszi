import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable, contasPagarTable } from "../lib/db/src/index";
import { coletarErrosApi, resumoErros, lerEstado, API_URL , diaLocalSP} from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * A partir da Onda 3, `/financeiro` é o **fluxo de caixa** — o hub, de leitura
 * pura. As contas e as parcelas ganharam telas próprias de ação
 * (`/financeiro/pagar`, `/financeiro/receber`), então é lá que este spec as
 * procura. A intenção dos testes é a de sempre: o financeiro precisa ser
 * operável pela interface, dos dois lados.
 *
 * **S-A11 — a fixture é DAQUI desde o E156.** Estes dois testes esperavam a
 * conta "Aluguel" e uma parcela em aberto que vinham do seed de demonstração; o
 * E147 tornou os exemplos financeiros opcionais (`SEED_EXEMPLOS_FINANCEIROS`) e
 * o seed idempotente não os recria em banco que já existe. Resultado: dois
 * vermelhos permanentes, `pnpm run test:e2e` saindo com EXIT=1 para todo mundo,
 * e a regra 11 valendo menos a cada run — quem roda a suíte aprende a ignorar
 * dois vermelhos, que é como o terceiro passa.
 *
 * O molde é o do 35-recebimento-parcial: cada teste traz o que precisa e leva
 * embora. **O vencimento é HOJE** porque a janela padrão das duas telas é o mês
 * corrente (`resolverIntervalo`) — data fixa sairia da janela na virada do mês,
 * que é o mesmo defeito com outro calendário.
 */

test.describe("Financeiro", () => {
  const stamp = Date.now();
  let leadId: string | null = null;
  let contratoId: string | null = null;
  let contaId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // Meio-dia de São Paulo: o dia não escorrega para o vizinho em fuso nenhum.
    const hoje = diaLocalSP();
    const vencimento = `${hoje}T12:00:00-03:00`;

    const conta = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/contas-pagar`,
      {
        data: {
          tipo: "DESPESA",
          descricao: "Aluguel",
          categoria: "Ocupação",
          valorPrevisto: 3200,
          vencimento,
        },
      },
    );
    expect(conta.status(), await conta.text()).toBe(201);
    contaId = ((await conta.json()) as { id: string }).id;

    // Lead próprio: o contrato exige que o lead não tenha outro contrato ativo.
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Financeiro ${stamp}`, origem: "LOJA" },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    const me = await request.get(`${API_URL}/api/auth/me`);
    expect(me.status()).toBe(200);
    const vendedoraId = (await me.json()).usuario.id;

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId,
        vendedoraId,
        valorTotal: 2500,
        parcelas: [{ numero: 0, valorPrevisto: 2500, vencimento }],
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = ((await contrato.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    // O banco do E2E persiste: sem limpar, cada run deixa uma noiva devendo R$
    // 2.500 e um aluguel eterno na fila de pagar. Parcelas antes do contrato, e
    // o contrato antes do lead — o FK lead→contrato é RESTRICT de propósito.
    if (contaId) await db.delete(contasPagarTable).where(eq(contasPagarTable.id, contaId));
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("hub carrega o caixa do período sem erros de API", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/financeiro");
    await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(
      erros,
      `Financeiro não deveria gerar erros de API:\n${resumoErros(erros)}`,
    ).toEqual([]);
  });

  test("contas a pagar aparecem com ação de pagamento", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/financeiro/pagar");
    await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();
    await expect(page.getByText("Aluguel").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagar" }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(erros, `Erros de API em /financeiro/pagar:\n${resumoErros(erros)}`).toEqual([]);
  });

  // Regressão do achado `financeiro-recebiveis`: no main a tela não listava as
  // parcelas a receber nem oferecia baixa — o financeiro de entrada era
  // inoperável pela interface.
  test("parcelas a receber aparecem com ação de baixa", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto("/financeiro/receber");
    await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Receber" }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(erros, `Erros de API em /financeiro/receber:\n${resumoErros(erros)}`).toEqual([]);
  });

  test("o hub leva às telas de ação pelo que está em aberto", async ({ page }) => {
    await page.goto("/financeiro");
    await page.getByRole("link", { name: /A receber/ }).click();
    await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
  });

  test("nenhum 'Invalid Date' ou 'NaN' renderizado nas telas do financeiro", async ({ page }) => {
    for (const rota of ["/financeiro", "/financeiro/pagar", "/financeiro/receber"]) {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      const corpo = (await page.locator("main, body").first().textContent()) ?? "";
      expect(corpo, `${rota} renderizou data inválida`).not.toContain("Invalid Date");
      expect(corpo, `${rota} renderizou NaN`).not.toContain("NaN");
    }
  });
});
