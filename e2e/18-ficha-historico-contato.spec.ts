import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E32: a timeline de contato da Cobrança agora também vive na ficha da noiva.
 * Aqui o card já nasce aberto (não é lazy como na fila), então registrar um
 * contato pela ficha grava e aparece na hora — o mesmo POST que zera o relógio
 * do "parado há N dias" do funil.
 */
test.describe("Ficha da noiva — histórico de contato (E32)", () => {
  test("registrar contato pela ficha aparece na timeline", async ({ page }) => {
    const falhas: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) {
        falhas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      }
    });

    await page.goto(`/noivas/${estado.leadId}`);
    await expect(page.getByText("Histórico de contato")).toBeVisible();

    // Card sempre aberto: o botão de registrar está à vista, sem accordion.
    const registrar = page.getByRole("button", { name: "Registrar contato" });
    await expect(registrar).toBeVisible();

    const recado = `Contato pela ficha ${Date.now()}`;
    await page.getByLabel("O que ficou combinado").fill(recado);
    await registrar.click();

    await expect(page.getByText(recado)).toBeVisible();
    expect(falhas, `Chamadas de API falharam: ${falhas.join(", ")}`).toEqual([]);
  });
});
