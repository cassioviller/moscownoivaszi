import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable } from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E49: a noiva paga metade. O que a tela precisa provar é que a parcela meio
 * recebida não some do "a receber" nem finge estar aberta por inteiro — ela
 * aparece como PARCIAL, dizendo quanto falta, e o botão passa a oferecer
 * exatamente o resto.
 */
test.describe("Recebimento parcial (E49)", () => {
  const stamp = Date.now();
  let leadId: string;
  let contratoId: string;
  let parcelaId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // Lead próprio: o contrato exige que o lead não tenha outro contrato ativo.
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Parcial ${stamp}`, origem: "LOJA" },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    // A vendedora do contrato é quem está logada — o seed não publica o id.
    const me = await request.get(`${API_URL}/api/auth/me`);
    expect(me.status()).toBe(200);
    const vendedoraId = (await me.json()).usuario.id;

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId,
        vendedoraId,
        valorTotal: 1000,
        parcelas: [
          {
            numero: 0,
            valorPrevisto: 1000,
            // Vencida, para também provar que o resto segue no atraso.
            vencimento: new Date(Date.now() - 5 * 86_400_000).toISOString(),
          },
        ],
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = (await contrato.json()).id;
    parcelaId = (await contrato.json()).parcelas?.[0]?.id ?? "";
  });

  test.afterAll(async () => {
    // O banco do e2e persiste: sem limpar, cada run deixa uma noiva com R$ 600
    // em atraso eterno na fila de cobrança. Parcelas antes do contrato, e o
    // contrato antes do lead — o FK lead→contrato é RESTRICT de propósito. A
    // trilha de auditoria é append-only e fica.
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("receber metade deixa a parcela PARCIAL, dizendo quanto falta", async ({ page }) => {
    await page.goto(`/contratos/${contratoId}`);

    const linha = page.locator("li").filter({ hasText: "Entrada" }).first();
    await linha.getByRole("button", { name: "Receber", exact: true }).click();

    // S-M20: a ficha do contrato usa o diálogo COMPARTILHADO (o mesmo de
    // /receber e /cobranca) — id e botão são os dele.
    // O diálogo sugere o saldo (1000, nada recebido ainda); recebemos 400.
    const valor = page.locator("#valorRecebido");
    await expect(valor).toHaveValue(/1000|1\.000/);
    await valor.fill("400,00");
    await page.getByTestId("confirmar-recebimento").click();

    // A parcela vira PARCIAL e diz o que falta — não some, nem finge inteira.
    await expect(linha.getByText("Parcial", { exact: false })).toBeVisible();
    // `\s` e não " ": desde o E92 o dinheiro sai de `brl()`, e o `Intl` do
    // pt-BR separa "R$" do número com espaço RÍGIDO (U+00A0). Playwright
    // normaliza espaço quando o seletor é string, mas NÃO quando é regex — foi
    // exatamente aqui que a troca deixou três testes vermelhos sem que uma
    // linha de comportamento mudasse.
    await expect(linha.getByText(/faltam R\$\s600,00/)).toBeVisible();
  });

  test("o botão passa a oferecer exatamente o restante", async ({ page }) => {
    await page.goto(`/contratos/${contratoId}`);
    const linha = page.locator("li").filter({ hasText: "Entrada" }).first();

    await linha.getByRole("button", { name: "Receber o restante" }).click();
    // Sugerir 1000 de novo cobraria outra vez o que já entrou.
    await expect(page.locator("#valorRecebido")).toHaveValue(/600/);
  });

  test("o resto continua no a receber e no atraso", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const res = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/financeiro/parcelas`);
    const parcela = (await res.json()).find((p: { id: string }) => p.id === parcelaId);
    // O dinheiro que entrou fica registrado e o resto segue devido — as duas
    // coisas ao mesmo tempo, que é a verdade de um pagamento parcial.
    expect(parcela.status).toBe("PARCIAL");
    expect(parcela.valorRecebido).toBe(400);
    expect(parcela.valorPrevisto).toBe(1000);

    // E a trilha diz que não quitou: sem o saldo restante, um recebimento
    // parcial no histórico não distingue "pagou tudo" de "pagou um pedaço".
    const trilha = await request.get(
      `${API_URL}/api/lojas/${estado.lojaId}/financeiro/auditoria?acao=PARCELA_RECEBIDA`,
    );
    const linha = (await trilha.json()).find(
      (l: { entidadeId: string }) => l.entidadeId === parcelaId,
    );
    expect(linha.detalhe).toMatchObject({ valorRecebido: 400, saldoRestante: 600 });
  });
});
