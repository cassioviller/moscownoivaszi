import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E36: iniciar um atendimento carimba `atendidoEm` (antes coluna morta) e a fila
 * passa a mostrar a que horas começou de verdade e a espera vs. o horário.
 */
test.describe("Atendimento — início real (E36)", () => {
  let atendimentoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    // Instante único dentro do expediente (09:00–18:00 de hoje) para não bater
    // na trava anti-corrida (cabine/vendedora × instante) entre execuções.
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const inicio = new Date(base.getTime() + (Date.now() % (9 * 3600_000))).toISOString();

    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
      data: {
        leadId: estado.leadId,
        cabineId: "e2e-cabine-1",
        vendedoraId: vendedoras[0]!.usuarioId,
        tipo: "ATENDIMENTO",
        inicio,
      },
    });
    expect(criado.status(), await criado.text()).toBe(201);
    atendimentoId = (await criado.json()).id as string;
  });

  test("iniciar carimba atendidoEm e a fila mostra o início real", async ({ page }) => {
    await page.goto("/atendimentos");
    const linha = page.getByTestId(`linha-atendimento-${atendimentoId}`);
    await expect(linha).toBeVisible();

    // Antes de iniciar, não há início real.
    await expect(page.getByTestId(`inicio-real-${atendimentoId}`)).toHaveCount(0);

    await linha.getByRole("button", { name: "Iniciar atendimento" }).click();

    const inicioReal = page.getByTestId(`inicio-real-${atendimentoId}`);
    await expect(inicioReal).toBeVisible();
    await expect(inicioReal).toContainText("começou");
  });
});
