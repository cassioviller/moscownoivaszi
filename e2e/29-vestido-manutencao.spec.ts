import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, vestidosTable, bloqueioVestidosTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E43: a ficha do vestido ganha "marcar em manutenção" — cria um bloqueio
 * MANUTENCAO. O motor de janelas, o POST /bloqueios e o selo já existiam; só
 * faltava a tela dispará-lo.
 */
test.describe("Vestido — marcar em manutenção (E43)", () => {
  let vestidoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const stamp = Date.now();
    const criado = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { codigo: `MANU${stamp}`, nome: `Vestido Manutenção ${stamp}`, precoBase: 3000 },
    });
    expect(criado.status(), await criado.text()).toBe(201);
    vestidoId = (await criado.json()).id;
  });

  test.afterAll(async () => {
    // O banco do e2e persiste. A manutenção que a tela criou é uma linha em
    // bloqueio_vestidos do vestido DESTE run — sai antes do vestido, na ordem
    // do FK.
    if (vestidoId) {
      await db.delete(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.vestidoId, vestidoId));
      await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    }
  });

  test("marcar em manutenção adiciona o bloqueio na ficha", async ({ page }) => {
    await page.goto(`/vestidos/${vestidoId}`);

    // Peça nova: nenhuma manutenção ainda.
    await expect(page.getByText("Manutenção", { exact: true })).toHaveCount(0);

    const inicio = new Date(Date.now() + 10 * 24 * 3600_000).toISOString().slice(0, 10);
    await page.getByTestId("manutencao-inicio").fill(inicio);
    await page.getByTestId("marcar-manutencao").click();

    // O bloqueio aparece na lista com o selo "Manutenção".
    await expect(page.getByText("Manutenção", { exact: true })).toBeVisible();
  });
});
