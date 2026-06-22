import { test, expect } from "@playwright/test";

test.describe("fluxo · criar noiva (write path real)", () => {
  test.use({ storageState: "tests/.auth/admin-a.json" });

  test("cria uma noiva e ela aparece na lista", async ({ page }) => {
    await page.goto("/loja/loja-a/noivas");
    await page.getByRole("button", { name: "+ Nova noiva" }).click();

    const form = page.locator("form", {
      has: page.getByRole("heading", { name: "Nova noiva" }),
    });
    await form.getByRole("textbox").first().fill("Carla E2E");
    await form.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Carla E2E")).toBeVisible();
  });
});
