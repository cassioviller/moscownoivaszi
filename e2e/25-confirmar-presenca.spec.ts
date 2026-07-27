import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E39, revisto pelo E97: o clique da recepção carimba `contatadoEm` — a loja
 * PROCUROU a noiva — e a linha sai da fila "Falta procurar" para ninguém
 * repetir. Quem confirma presença é ela, pelo portal (E85), noutro campo.
 */
test.describe("Procurar para confirmar (E39, revisto pelo E97)", () => {
  let atendimentoId: string;
  let ymd: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    ymd = new Date().toISOString().slice(0, 10);
    const mm = String(Math.floor(Date.now() / 1000) % 60).padStart(2, "0");
    const ss = String(Date.now() % 60).padStart(2, "0");
    const inicio = `${ymd}T14:${mm}:${ss}-03:00`;

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

  test("procurar tira a noiva da fila do dia", async ({ page }) => {
    // O clique abre o wa.me em nova aba — fecha o popup para não pendurar o teste.
    page.on("popup", (p) => p.close().catch(() => {}));

    await page.goto(`/agenda?dia=${ymd}`);

    const linha = page.getByTestId(`confirmar-linha-${atendimentoId}`);
    await expect(linha).toBeVisible();

    await page.getByTestId(`confirmar-btn-${atendimentoId}`).click();

    // Carimbada a confirmação, a linha deixa a fila de "falta confirmar".
    await expect(page.getByTestId(`confirmar-linha-${atendimentoId}`)).toHaveCount(0);
  });
});
