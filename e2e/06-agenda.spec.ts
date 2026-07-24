import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Agenda", () => {
  test("página abre com cabines listadas", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page.getByText("Atendimentos do Dia")).toBeVisible();
    // A cabine agora é coluna da grade (E28) além de item da lista lateral —
    // `.first()` desfaz a ambiguidade de o nome aparecer nos dois lugares.
    await expect(page.getByText("E2E Cabine").first()).toBeVisible();
  });

  // Era achado C4 (botão sem handler); hoje abre o formulário.
  test("botão Novo Agendamento abre formulário", async ({ page }) => {
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Novo Agendamento" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  // Era achado agenda-dia (a lista mostrava a história inteira, sem filtro de
  // data). A grade do E28 só recebe os atendimentos do dia escolhido; a prova é
  // um atendimento em OUTRA data não ter célula na grade de hoje.
  test("a grade mostra só os atendimentos do dia", async ({ page, request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // Um atendimento num dia fixo e distante — não é "hoje" em nenhuma execução.
    const outroDia = "2028-02-14";
    // Re-executável: limpa o que uma corrida anterior deixou nesse dia.
    const existentes = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`);
    for (const a of (await existentes.json()) as { id: string; inicio: string }[]) {
      if (a.inicio.startsWith(outroDia)) {
        await request.delete(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${a.id}`);
      }
    }
    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoraId = ((await equipe.json()) as { usuarioId: string }[])[0]!.usuarioId;
    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
      data: {
        leadId: estado.leadId,
        cabineId: estado.cabineId,
        vendedoraId,
        tipo: "ATENDIMENTO",
        inicio: new Date(`${outroDia}T14:00:00-03:00`).toISOString(),
      },
    });
    expect(criado.status(), await criado.text()).toBe(201);
    const outroId = (await criado.json()).id;

    await page.goto("/agenda");
    await expect(page.getByTestId("grade-agenda")).toBeVisible();
    // O atendimento de 2028 não aparece na grade de hoje.
    await expect(page.getByTestId(`card-agenda-${outroId}`)).toHaveCount(0);
    // Mas aparece quando a URL aponta para o dia dele.
    await page.goto(`/agenda?dia=${outroDia}`);
    await expect(page.getByTestId(`card-agenda-${outroId}`)).toBeVisible();
  });
});
