import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E50: `formaRecebimento` era gravada e nenhum relatório a lia. O breakdown
 * aparece no DRE e no hub de fluxo — e o que o teste cobra é a invariante que
 * sustenta a conciliação: o recorte por meio soma o MESMO que o total de
 * recebimentos da tela.
 */
test.describe("Recebimentos por meio (E50)", () => {
  const stamp = Date.now();
  /** Competência do mês corrente: é onde o recebimento de hoje cai. */
  const hoje = new Date();
  const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;

    // Duas parcelas recebidas hoje por meios diferentes: é o mínimo para o
    // recorte ter mais de uma linha e a soma poder divergir se estiver errada.
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Meio ${stamp}`, origem: "LOJA" },
    });
    expect(lead.status(), await lead.text()).toBe(201);

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId: (await lead.json()).id,
        vendedoraId,
        valorTotal: 900,
        parcelas: [
          { numero: 0, valorPrevisto: 300, vencimento: new Date().toISOString() },
          { numero: 1, valorPrevisto: 600, vencimento: new Date().toISOString() },
        ],
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);

    const parcelas = (await contrato.json()).parcelas as { id: string; numero: number }[];
    const receber = (id: string, valor: number, forma: string) =>
      request.post(`${API_URL}/api/lojas/${estado.lojaId}/parcelas/${id}/receber`, {
        data: { valorRecebido: valor, recebidoEm: new Date().toISOString(), formaRecebimento: forma },
      });

    const p0 = parcelas.find((p) => p.numero === 0)!;
    const p1 = parcelas.find((p) => p.numero === 1)!;
    expect((await receber(p0.id, 300, "PIX")).status()).toBe(200);
    expect((await receber(p1.id, 600, "CARTAO_CREDITO")).status()).toBe(200);
  });

  test("o DRE mostra o recorte por meio, com Pix e cartão", async ({ page }) => {
    await page.goto(`/financeiro/dre?comp=${competencia}`);
    await expect(page.getByRole("heading", { name: "Resultado do mês" })).toBeVisible();

    const bloco = page.getByTestId("recebimentos-por-forma");
    await expect(bloco).toBeVisible();
    await expect(bloco).toContainText("Pix");
    await expect(bloco).toContainText("Cartão de crédito");
    // A ressalva do dado fica na tela, não só no código.
    await expect(bloco).toContainText("último recebimento");
  });

  test("o hub de fluxo mostra o mesmo recorte", async ({ page }) => {
    await page.goto("/financeiro");
    await expect(page.getByRole("heading", { name: "Fluxo de caixa" })).toBeVisible();
    await expect(page.getByTestId("recebimentos-por-forma")).toContainText("Pix");
  });

  test("o CSV do DRE leva as linhas por meio", async ({ page }) => {
    await page.goto(`/financeiro/dre?comp=${competencia}`);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar CSV" }).click(),
    ]);
    const stream = await download.createReadStream();
    const csv = (await new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = [];
      stream.on("data", (p) => partes.push(Buffer.from(p)));
      stream.on("end", () => resolve(Buffer.concat(partes)));
      stream.on("error", reject);
    })).toString("utf-8");

    expect(csv).toContain("Recebimento — Pix");
    expect(csv).toContain("Recebimento — Cartão de crédito");

    // A invariante: as linhas por meio somam a linha de Recebimentos. É o
    // número que a contadora bate contra o extrato.
    const linhas = csv.replace("﻿", "").trim().split("\r\n").map((l) => l.split(","));
    const total = Number(linhas.find((l) => l[1] === "Recebimentos")![2]);
    const soma = linhas
      .filter((l) => l[1].startsWith("Recebimento — "))
      .reduce((s, l) => s + Number(l[2]), 0);
    expect(soma.toFixed(2)).toBe(total.toFixed(2));
  });
});
