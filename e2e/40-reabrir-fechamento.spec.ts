import { test, expect } from "@playwright/test";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, contratosTable, comissaoFechamentosTable, contasPagarTable } from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E54: fechou errado, dá para desfazer sem SQL. O que a tela precisa provar é
 * que a confirmação DIZ o que some (não só "tem certeza?") e que, depois de
 * reabrir, a competência volta a poder ser fechada — que é o motivo de reabrir.
 *
 * A venda é datada por UPDATE direto: `fechadoEm` é carimbado pelo servidor, e
 * sem venda passada não há competência que possa fechar.
 */
test.describe("Reabrir fechamento (E54)", () => {
  const stamp = Date.now();
  const competencia = (() => {
    const d = new Date(Date.now() - 3 * 3_600_000);
    d.setUTCMonth(d.getUTCMonth() - 4);
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
      data: { noivaNome: `E2E Reabrir ${stamp}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: { leadId: (await lead.json()).id, vendedoraId, valorTotal: 8000 },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = (await contrato.json()).id;

    await db
      .update(contratosTable)
      .set({ fechadoEm: new Date(`${competencia}-12T12:00:00-03:00`) })
      .where(eq(contratosTable.id, contratoId));

    // Deixa a competência FECHADA para o teste poder reabri-la.
    const fech = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/comissao/fechamentos`, {
      data: { competencia },
    });
    expect([201, 409]).toContain(fech.status());
  });

  test.afterAll(async () => {
    // Não deixa a competência do e2e fechada nem o contrato pesando na
    // varredura de pendências dos outros specs.
    // S-O130: a conta a pagar que o fechamento gerou sai ANTES da linha do
    // fechamento (a FK do fechamento para a conta é SET NULL, e a conta ficava).
    const fechamentos = await db.select({ contaPagarId: comissaoFechamentosTable.contaPagarId }).from(comissaoFechamentosTable).where(
      and(eq(comissaoFechamentosTable.lojaId, estado.lojaId), eq(comissaoFechamentosTable.competencia, competencia)),
    );
    const contas = fechamentos.map((f) => f.contaPagarId).filter((c): c is string => !!c);
    await db.delete(comissaoFechamentosTable).where(
      and(
        eq(comissaoFechamentosTable.lojaId, estado.lojaId),
        eq(comissaoFechamentosTable.competencia, competencia),
      ),
    );
    if (contratoId) {
      await db.update(contratosTable).set({ status: "CANCELADO" }).where(eq(contratosTable.id, contratoId));
    }
    for (const contaId of contas) await db.delete(contasPagarTable).where(eq(contasPagarTable.id, contaId));
  });

  test("a confirmação diz o que some, e reabrir libera a competência", async ({ page, request }) => {
    await page.goto(`/comissoes?competencia=${competencia}`);
    await expect(page.getByText("Fechado", { exact: true })).toBeVisible();

    const [fechamento] = await db
      .select()
      .from(comissaoFechamentosTable)
      .where(and(
        eq(comissaoFechamentosTable.lojaId, estado.lojaId),
        eq(comissaoFechamentosTable.competencia, competencia),
      ));
    expect(fechamento).toBeTruthy();

    await page.getByTestId(`reabrir-${fechamento.id}`).click();

    // Não é "tem certeza?": a confirmação nomeia o que desaparece.
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toContainText("a conta a pagar de R$");
    await expect(dialogo).toContainText("voltam a pendentes");
    await expect(dialogo).toContainText("trilha de auditoria");

    await dialogo.getByRole("button", { name: "Reabrir", exact: true }).click();
    await expect(page.getByText(/reaberto/i).first()).toBeVisible();

    // A competência voltou a ser fechável — que é o ponto de reabrir.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const denovo = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/comissao/fechamentos`, {
      data: { competencia },
    });
    expect(denovo.status(), await denovo.text()).toBe(201);

    // E a reabertura deixou linha na trilha.
    const trilha = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/auditoria?acao=COMISSAO_FECHAMENTO_REABERTO`,
    );
    expect(trilha.status()).toBe(200);
    expect((await trilha.json()).length).toBeGreaterThan(0);
  });
});
