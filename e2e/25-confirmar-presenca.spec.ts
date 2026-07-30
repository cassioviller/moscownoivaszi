import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL, criarAtendimentoLivre } from "./helpers";

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

    // E115 — este spec era a S7 por escrito: cabine fixa às 14:mm de HOJE num
    // banco que persiste. Com a recusa de INTERVALO nova, a colisão com as
    // próprias sobras deixou de ser sorte. Cabine própria por execução,
    // horário livre, e o spec apaga o que criou (afterAll).
    const cab = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e25-${Date.now()}` },
    });
    expect(cab.status(), await cab.text()).toBe(201);

    ymd = new Date().toISOString().slice(0, 10);
    const criado = await criarAtendimentoLivre(request, estado.lojaId, {
      leadId: estado.leadId,
      cabineId: ((await cab.json()) as { id: string }).id,
      vendedoraId: vendedoras[0]!.usuarioId,
      ymd,
    });
    atendimentoId = criado.id;
  });

  test.afterAll(async ({ request }) => {
    // Sem isto, cada execução deixava um atendimento de hoje para as
    // seguintes colidirem — a família da S18/S25.
    await request.delete(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${atendimentoId}`);
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
