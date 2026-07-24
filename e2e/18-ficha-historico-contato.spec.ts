import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, coletarErrosApi, resumoErros } from "./helpers";

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
    // O coletor da casa: já sabe que o 404 do card do portal (E78) é estado.
    const falhas = coletarErrosApi(page);

    await page.goto(`/noivas/${estado.leadId}`);
    await expect(page.getByText("Histórico de contato")).toBeVisible();

    // Card sempre aberto: o botão de registrar está à vista, sem accordion.
    const registrar = page.getByRole("button", { name: "Registrar contato" });
    await expect(registrar).toBeVisible();

    const recado = `Contato pela ficha ${Date.now()}`;
    await page.getByLabel("O que ficou combinado").fill(recado);
    await registrar.click();

    await expect(page.getByText(recado)).toBeVisible();
    expect(falhas, `Chamadas de API falharam:\n${resumoErros(falhas)}`).toEqual([]);
  });
});
