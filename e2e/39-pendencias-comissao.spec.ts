import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, contratosTable } from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E53: a competência esquecida. O fechamento é um mês por vez e nada
 * sinalizava o mês que ficou para trás — a vendedora não recebe, ninguém
 * reclama porque ninguém sabe.
 *
 * O `fechadoEm` do contrato é carimbado pelo servidor (autoridade dele, e está
 * certo), então a venda passada é datada por UPDATE direto — não há como
 * backdatar pela API, e sem venda passada não há pendência a varrer.
 */
test.describe("Competência esquecida (E53)", () => {
  const stamp = Date.now();
  /** Um mês bem no passado, dentro da janela de 12 meses da varredura. */
  const competencia = (() => {
    const d = new Date(Date.now() - 3 * 3_600_000);
    d.setUTCMonth(d.getUTCMonth() - 6);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();

  let contratoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Esquecida ${stamp}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: { leadId: (await lead.json()).id, vendedoraId, valorTotal: 12345 },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = (await contrato.json()).id;

    await db
      .update(contratosTable)
      .set({ fechadoEm: new Date(`${competencia}-10T12:00:00-03:00`) })
      .where(eq(contratosTable.id, contratoId));
  });

  test.afterAll(async () => {
    // Cancelar tira o contrato da varredura sem apagar o histórico — a loja
    // do e2e não pode ficar com um alerta permanente para os outros specs.
    if (contratoId) {
      await db
        .update(contratosTable)
        .set({ status: "CANCELADO" })
        .where(inArray(contratosTable.id, [contratoId]));
    }
  });

  test("o alerta aponta o mês esquecido e leva até ele", async ({ page }) => {
    await page.goto("/comissoes");

    const alerta = page.getByTestId("pendencias-comissao");
    await expect(alerta).toBeVisible();
    await expect(alerta).toContainText("12.345,00");
    await expect(alerta).toContainText("sem fechamento");

    // Avisar sem dar o caminho é meio aviso: a linha troca a competência em
    // vista, que é de onde o fechamento é disparado.
    const rotulo = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${competencia}-01T12:00:00Z`));
    await alerta.getByRole("button", { name: new RegExp(rotulo, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`competencia=${competencia}`));
  });
});
