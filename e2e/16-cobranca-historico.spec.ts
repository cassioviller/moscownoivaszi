import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Histórico de cobrança — o accordion por noiva na fila de inadimplência.
 *
 * A fila só existe se houver parcela PREVISTA vencida, e o seed global não tem
 * nenhuma (ninguém está em atraso). Este spec cria a sua própria noiva em
 * atraso: contrato + plano com o primeiro vencimento no passado.
 */
test.describe("Cobrança — histórico por noiva", () => {
  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // Já em atraso? Então a fila já tem quem cobrar e não criamos de novo.
    const parcelas = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/parcelas`);
    expect(parcelas.status(), await parcelas.text()).toBe(200);
    const lista = (await parcelas.json()) as { status: string; vencimento: string }[];
    const hoje = new Date().toISOString();
    const jaTemAtraso = lista.some((p) => p.status === "PREVISTA" && p.vencimento < hoje);
    if (jaTemAtraso) return;

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { id: string }[];

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId: estado.leadId,
        vendedoraId: vendedoras[0]!.id,
        valorTotal: 3000,
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    const { id: contratoId } = (await contrato.json()) as { id: string };

    // 120 dias atrás: cai na faixa "mais de 60 dias" e não depende de quando a
    // suíte roda.
    const vencido = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const plano = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`,
      { data: { numParcelas: 1, primeiroVencimento: vencido } },
    );
    expect(plano.status(), await plano.text()).toBe(201);
  });

  test("abrir o histórico busca só o da noiva aberta, e o contato registrado aparece", async ({
    page,
  }) => {
    const chamadas: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.pathname.includes("/cobrancas")) chamadas.push(`${r.method()} ${url.pathname}`);
    });
    const falhas: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) {
        falhas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      }
    });

    await page.goto("/financeiro/cobranca");
    await expect(page.getByRole("heading", { name: "Cobrança", exact: true })).toBeVisible();

    const linha = page.locator("li", { has: page.getByRole("button", { name: /Histórico/ }) }).first();
    await expect(linha).toBeVisible();

    // A query é LAZY: antes de abrir, nenhuma request de histórico saiu.
    await page.waitForLoadState("networkidle");
    expect(chamadas, "histórico não deveria ser buscado antes de abrir").toEqual([]);

    await linha.getByRole("button", { name: /Histórico/ }).click();

    // O painel abriu (o formulário é o que sempre existe — o histórico pode já
    // ter registros de uma execução anterior: o banco de dev é persistente).
    await expect(linha.getByRole("button", { name: "Registrar contato" })).toBeVisible();
    expect(chamadas.filter((c) => c.startsWith("GET"))).toHaveLength(1);

    const registros = linha.locator("ul li");
    const antes = await registros.count();

    const recado = `E2E ligou em ${Date.now()}`;
    await linha.getByLabel("O que ficou combinado").fill(recado);
    await linha.getByRole("button", { name: "Registrar contato" }).click();

    await expect(linha.getByText(recado)).toBeVisible();
    await expect(registros).toHaveCount(antes + 1);
    // Recém-registrado = mais recente: o histórico lê do topo para o passado.
    await expect(registros.first()).toContainText(recado);
    expect(falhas, `Chamadas de API falharam: ${falhas.join(", ")}`).toEqual([]);
  });

  test("nenhum 'Invalid Date' no histórico", async ({ page }) => {
    await page.goto("/financeiro/cobranca");
    const linha = page.locator("li", { has: page.getByRole("button", { name: /Histórico/ }) }).first();
    await linha.getByRole("button", { name: /Histórico/ }).click();
    await page.waitForLoadState("networkidle");
    const corpo = (await linha.textContent()) ?? "";
    expect(corpo).not.toContain("Invalid Date");
    expect(corpo).not.toContain("NaN");
  });
});
