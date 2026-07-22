import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E81 (fiscal do E70): a dona sobe o extrato CSV e a tela responde as três
 * perguntas — o que bateu, o que só está no banco, o que só está no sistema.
 * O arquivo não sai do navegador; o teste sobe uma fixture com um par exato
 * (o recebimento semeado) e uma tarifa que o sistema não conhece.
 */
test.describe("Conciliação por extrato (E70)", () => {
  const stamp = Date.now();
  // Dia fixo e futuro (como a grade E28): o seed global não polui a janela.
  const DIA_BR = "15/05/2027";
  const VALOR = 1234.56;
  let leadId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Concilia ${stamp}` },
    });
    leadId = (await lead.json()).id;

    const admin = await db.query.usuariosTable.findFirst({
      where: (u, { eq: eq_ }) => eq_(u.email, estado.adminEmail),
    });
    const contratoId = randomUUID();
    await db.insert(contratosTable).values({
      id: contratoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId: admin!.id,
      status: "ATIVO",
      valorTotal: VALOR,
      fechadoEm: new Date(),
    });
    // Recebida NO dia do extrato — o par exato do CSV.
    await db.insert(parcelasTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      contratoId,
      numero: 1,
      valorPrevisto: VALOR,
      vencimento: new Date("2027-05-15T12:00:00-03:00"),
      status: "PAGA",
      valorRecebido: VALOR,
      recebidoEm: new Date("2027-05-15T12:00:00-03:00"),
      formaRecebimento: "PIX",
    });
  });

  test.afterAll(async () => {
    // O cascade do lead leva contrato e parcelas.
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("o extrato casa o recebimento e denuncia a tarifa sem par", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/conciliacao`);

    const csv = [
      `Data,Descrição,Valor`,
      `${DIA_BR},PIX recebido noiva,${VALOR}`,
      `${DIA_BR},Tarifa bancária E2E,-25.00`,
    ].join("\n");
    await page.getByTestId("input-extrato").setInputFiles({
      name: "extrato-e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    // Os três placares aparecem — e o par exato bateu.
    await expect(page.getByText("Bateu")).toBeVisible();
    await expect(page.getByText("No banco, mas não no sistema")).toBeVisible();
    await expect(page.getByText("No sistema, mas não no banco")).toBeVisible();

    // A tarifa é pendência do lado do banco; o PIX casado não aparece nela.
    const soBanco = page.locator("div.space-y-6 > *", {
      has: page.getByText("No banco, mas não no sistema"),
    });
    await expect(soBanco.getByText("Tarifa bancária E2E")).toBeVisible();
    await expect(soBanco.getByText("PIX recebido noiva")).not.toBeVisible();
  });

  test("arquivo ilegível explica o erro em vez de tela vazia", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/conciliacao`);
    await page.getByTestId("input-extrato").setInputFiles({
      name: "nada.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("isto não é um extrato", "utf-8"),
    });
    await expect(page.getByText(/Nenhuma transação reconhecida/).first()).toBeVisible();
  });
});
