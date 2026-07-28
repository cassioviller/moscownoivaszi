import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Onda 5 — as duas capacidades net-new: o PDF de contrato (o main não gerava
 * PDF nenhum) e a folha de pagamento.
 */

function observarApi(page: Page): string[] {
  const falhas: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      falhas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });
  return falhas;
}

test.describe("Onda 5 — folha", () => {
  test("/financeiro/folha monta e carrega dados sem erro de API", async ({ page }) => {
    const falhas = observarApi(page);
    await page.goto("/financeiro/folha");
    await expect(page.getByRole("heading", { name: "Folha do mês", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(falhas, `Chamadas de API falharam: ${falhas.join(", ")}`).toEqual([]);
  });

  // E103/F31: o H1 dizia "Recorrências do mês" e o link dizia "Folha do mês" —
  // quem procurava "folha" não achava, e quem achava lia outro nome. A loja
  // chama de folha, e a tela entrou na sidebar (era alcançável só por um botão
  // secundário dentro de contas a pagar).
  test("a folha é alcançável a partir de contas a pagar", async ({ page }) => {
    await page.goto("/financeiro/pagar");
    await page.getByRole("link", { name: /Folha/ }).first().click();
    await expect(page.getByRole("heading", { name: "Folha do mês", exact: true })).toBeVisible();
  });

  test("nenhum 'Invalid Date' ou 'NaN' nas recorrências", async ({ page }) => {
    await page.goto("/financeiro/folha");
    await page.waitForLoadState("networkidle");
    const corpo = (await page.locator("main, body").first().textContent()) ?? "";
    expect(corpo).not.toContain("Invalid Date");
    expect(corpo).not.toContain("NaN");
  });

  test("PROBE API: exportar a contabilidade devolve CSV e NÃO marca como enviado", async ({
    request,
  }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const res = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/folha/exportar?de=2025-01-01&ate=2025-12-31`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    // BOM: sem ele o Excel lê UTF-8 como latin-1.
    expect(await res.text()).toMatch(/^﻿/);

    /**
     * O GET tem que ser seguro: baixar o arquivo não pode carimbar o período.
     * Marcar é um POST explícito — conferir antes de mandar precisa ser possível.
     *
     * **A asserção olha UM pagamento, criado aqui, e não todos os da loja.**
     * Ela varria a carteira inteira, e isso a tornava uma mina: qualquer carimbo
     * de qualquer origem — outro spec, a tela de fechar o mês do F34 — a
     * deixaria vermelha em TODA execução futura, num banco que persiste. E um
     * vermelho desses se lê como regressão de dinheiro. A intenção do teste é
     * sobre o VERBO (GET não escreve), não sobre o estado global da loja.
     */
    const conta = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/contas-pagar`,
      {
        data: {
          tipo: "DESPESA",
          descricao: `Probe GET seguro ${Date.now()}`,
          valorPrevisto: 10,
          vencimento: new Date().toISOString(),
        },
      },
    );
    expect(conta.status(), await conta.text()).toBe(201);
    const pago = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/pagamentos`,
      {
        data: {
          data: new Date().toISOString(),
          contaIds: [(await conta.json()).id],
          valorPago: 10,
        },
      },
    );
    expect(pago.status(), await pago.text()).toBe(201);
    const meuId = (await pago.json()).id as string;

    // O export de novo, agora com o pagamento deste spec dentro da janela.
    await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/folha/exportar?de=2020-01-01&ate=2099-12-31`,
    );

    const pagamentos = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/pagamentos`);
    expect(pagamentos.status()).toBe(200);
    const meu = (await pagamentos.json()).find((x: { id: string }) => x.id === meuId);
    expect(meu, "o pagamento criado pelo spec sumiu da lista").toBeTruthy();
    expect(meu.enviadoContabilidadeEm ?? null).toBeNull();
  });

  test("PROBE API: gerar a competência é idempotente", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const gerar = () =>
      request.post(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/recorrencias/gerar`, {
        data: { competencia: "2025-01" },
      });

    // 200, não 201: a rota é idempotente e pode não criar nada — 201 seria
    // mentira na reexecução, que é justamente o caso que importa aqui.
    const primeira = await gerar();
    expect(primeira.status()).toBe(200);
    expect((await primeira.json()).geradas).toBeGreaterThanOrEqual(0);

    // Rodar de novo não pode pagar ninguém duas vezes.
    const segunda = await gerar();
    expect(segunda.status()).toBe(200);
    expect((await segunda.json()).geradas, "reexecutar a geração não pode gerar de novo").toBe(0);
  });
});

test.describe("Onda 5 — PDF de contrato", () => {
  test("PROBE API: o contrato baixa como PDF de verdade", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const contratos = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/contratos`);
    expect(contratos.status()).toBe(200);
    const lista = await contratos.json();
    test.skip(lista.length === 0, "sem contrato no seed para exportar");

    const res = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${lista[0].id}/pdf`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    // O byte, não a promessa: um PDF válido começa com %PDF- e fecha com %%EOF.
    const corpo = await res.body();
    expect(corpo.subarray(0, 5).toString()).toBe("%PDF-");
    expect(corpo.subarray(-6).toString()).toContain("%%EOF");
  });
});
