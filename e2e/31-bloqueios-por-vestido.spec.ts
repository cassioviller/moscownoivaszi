import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, vestidosTable, bloqueioVestidosTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E45: GET /bloqueios?vestidoId= devolve só os bloqueios do vestido, com a noiva
 * embutida (lead do join). A ficha para de baixar a loja inteira e de cruzar com
 * todos os leads no cliente.
 */
test.describe("Bloqueios por vestido (E45)", () => {
  let vestidoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const stamp = Date.now();
    const ves = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/vestidos`, {
      data: { codigo: `BLQ${stamp}`, nome: `Vestido Bloqueio ${stamp}`, precoBase: 3000 },
    });
    expect(ves.status(), await ves.text()).toBe(201);
    vestidoId = (await ves.json()).id;

    // Reserva com casamento em data única (evita colisão de ocupação entre runs).
    const casamento = new Date(Date.now() + (400 + (Date.now() % 3000)) * 24 * 3600_000).toISOString();
    const blq = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios`, {
      data: { vestidoId, leadId: estado.leadId, tipo: "RESERVA_CASAMENTO", casamentoData: casamento },
    });
    expect(blq.status(), await blq.text()).toBe(201);
  });

  test.afterAll(async () => {
    // O banco do e2e persiste: a reserva sai antes do vestido (ordem do FK), e
    // só a do vestido DESTE run — o lead da reserva é o do seed e fica.
    if (vestidoId) {
      await db.delete(bloqueioVestidosTable).where(eq(bloqueioVestidosTable.vestidoId, vestidoId));
      await db.delete(vestidosTable).where(eq(vestidosTable.id, vestidoId));
    }
  });

  test("o filtro devolve só o vestido, com a noiva embutida; a ficha mostra", async ({ page, request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const res = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/bloqueios?vestidoId=${vestidoId}`);
    expect(res.status()).toBe(200);
    const lista = (await res.json()) as { vestidoId: string; tipo: string; lead: { noivaNome: string } | null }[];
    expect(lista.length).toBeGreaterThan(0);
    // Todos são do vestido pedido — o filtro isolou.
    expect(lista.every((b) => b.vestidoId === vestidoId)).toBe(true);
    // A reserva traz a noiva embutida (sem baixar a lista de leads).
    const reserva = lista.find((b) => b.tipo === "RESERVA_CASAMENTO");
    expect(reserva?.lead?.noivaNome).toBe("E2E Noiva Playwright");

    // E a ficha mostra a noiva na linha da reserva.
    await page.goto(`/vestidos/${vestidoId}`);
    await expect(page.getByText("E2E Noiva Playwright")).toBeVisible();
  });
});
