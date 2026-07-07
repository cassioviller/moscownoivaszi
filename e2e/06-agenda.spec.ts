import { test, expect } from "@playwright/test";
import path from "node:path";

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Agenda", () => {
  test("página abre com cabines listadas", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page.getByText("Atendimentos do Dia")).toBeVisible();
    await expect(page.getByText("E2E Cabine")).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C4): botão "Novo Agendamento" sem handler
  // (agenda/index.tsx:20-23) — impossível agendar pela interface.
  test("botão Novo Agendamento abre formulário", async ({ page }) => {
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Novo Agendamento" }).click();
    await expect(
      page.getByRole("dialog"),
      "Novo Agendamento deveria abrir formulário (botão sem handler em agenda/index.tsx:20)",
    ).toBeVisible();
  });

  // FALHA ESPERADA no main (achado agenda-dia): o card "Atendimentos do Dia"
  // lista TODOS os atendimentos da história (agenda/index.tsx:10 — sem filtro
  // de data). O atendimento seedado é de dias atrás e não pode aparecer.
  test("Atendimentos do Dia mostra apenas atendimentos de hoje", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page.getByText("Atendimentos do Dia")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Cada linha tem o horário completo via toLocaleString(); qualquer data
    // que não seja a de hoje denuncia a ausência de filtro.
    const hoje = new Date().toLocaleDateString();
    const linhas = page.locator("div.hover-elevate p.text-muted-foreground");
    const total = await linhas.count();
    for (let i = 0; i < total; i++) {
      const texto = (await linhas.nth(i).textContent()) ?? "";
      expect(
        texto.includes(hoje),
        `Card 'do Dia' exibe atendimento de outra data: "${texto}" (sem filtro em agenda/index.tsx:10)`,
      ).toBe(true);
    }
  });
});
