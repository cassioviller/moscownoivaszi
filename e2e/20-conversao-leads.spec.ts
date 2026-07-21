import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado } from "./helpers";

lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E34: o relatório de conversão dá consumidor ao motivo de perda (E4) e à
 * origem (E19). O seed tem leads de origem LOJA, então "Por origem" mostra
 * "Loja"; os agregados vêm do endpoint /leads/conversao.
 */
test.describe("Conversão de leads (E34)", () => {
  test("abre pelo botão e mostra os agregados", async ({ page }) => {
    const falhas: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) {
        falhas.push(`${r.status()} ${new URL(r.url()).pathname}`);
      }
    });

    await page.goto("/noivas");
    await page.getByTestId("link-conversao").click();

    await expect(page).toHaveURL(/\/noivas\/conversao$/);
    await expect(page.getByRole("heading", { name: "Conversão" })).toBeVisible();
    await expect(page.getByText("Por origem")).toBeVisible();
    await expect(page.getByText("Por que se perderam")).toBeVisible();
    // Rótulo da origem do seed (leads LOJA).
    await expect(page.getByText("Loja", { exact: true }).first()).toBeVisible();

    expect(falhas, `Chamadas de API falharam: ${falhas.join(", ")}`).toEqual([]);
  });
});
