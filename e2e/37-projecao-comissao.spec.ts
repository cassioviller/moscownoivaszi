import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable } from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E51: "no seu ritmo, o mês fecha em Y%". A escada da admin já vem do seed; o
 * que este spec cobra é que a projeção aparece nas duas telas — o extrato
 * pessoal e o ranking da gestão — e que as duas contam a MESMA história.
 *
 * A projeção só existe da metade da primeira semana em diante (regra de
 * produto: run-rate de dois dias é ruído). Rodar a suíte no dia 3 não pode
 * reprovar o que está certo, então o spec confere o dia antes de cobrar.
 */

const DIA_DE_HOJE = new Date(Date.now() - 3 * 3_600_000).getUTCDate();
const MIN_DIAS_PROJECAO = 5;
const competencia = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);

test.describe("Projeção de comissão (E51)", () => {
  test.skip(DIA_DE_HOJE < MIN_DIAS_PROJECAO, "cedo demais no mês: não há projeção a mostrar");

  // Nulos quando o describe inteiro é pulado (os hooks não rodam) — os guards
  // do afterAll cobrem também um beforeAll que morreu no meio.
  let leadId: string | null = null;
  let contratoId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;

    // Uma venda na competência corrente, para haver ritmo a projetar.
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Ritmo ${Date.now()}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId,
        vendedoraId,
        valorTotal: 5000,
        fechadoEm: new Date().toISOString(),
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = ((await contrato.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    // O banco do e2e persiste: a venda de R$ 5.000 deste run não pode somar no
    // acumulado da vendedora a cada execução. Parcelas (se a rota gerou) antes
    // do contrato, e o contrato antes do lead — o FK lead→contrato é RESTRICT.
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("o extrato pessoal mostra para onde o mês está indo", async ({ page }) => {
    await page.goto(`/minha-comissao?competencia=${competencia}`);

    const card = page.getByTestId("projecao-comissao");
    await expect(card).toBeVisible();
    await expect(card).toContainText("No seu ritmo");
    // Diz de quanto tempo de mês o número foi tirado — sem isso a projeção
    // não tem como ser julgada por quem lê.
    await expect(card).toContainText(`Com ${DIA_DE_HOJE} de`);
    await expect(card).toContainText("dias, o mês caminha para");
    // Projeção não é promessa — e a tela diz isso, senão vira valor a receber.
    await expect(card).toContainText("não uma garantia");
  });

  test("o ranking da gestão mostra a mesma projeção", async ({ page, request }) => {
    await page.goto(`/comissoes?competencia=${competencia}`);
    await expect(page.getByTestId("projecao-linha").first()).toContainText("No ritmo");

    // E o número da tela é o mesmo que o extrato pessoal recebe: ranking e
    // extrato não podem discordar sobre o mesmo mês.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const [minha, preview] = await Promise.all([
      request.get(`${API_URL}/api/lojas/${estado.lojaId}/minha-comissao?competencia=${competencia}`),
      request.get(`${API_URL}/api/lojas/${estado.lojaId}/comissao/preview?competencia=${competencia}`),
    ]);
    const meu = (await minha.json()).projecao;
    const linhas = await preview.json();
    const minhaLinha = linhas.find(
      (l: { projecao: { valorTotalProjetado: number } | null }) => l.projecao !== null,
    );
    expect(minhaLinha.projecao.valorTotalProjetado).toBe(meu.valorTotalProjetado);
  });
});
