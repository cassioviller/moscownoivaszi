import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  orcamentosTable,
  orcamentoItensTable,
  orcamentoVersoesTable,
  usuariosTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

// A sessão de admin fica no contexto para as chamadas de PREPARO (gerar o
// link) — a página em si é pública e não a usa: é o que a noiva abre no
// celular, sem login nenhum.
test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E166 — o PRIMEIRO E2E do caminho público.
 *
 * A régua do plano mediu: eram ZERO specs cobrindo a página que decide a
 * compra — o link que a noiva abre no WhatsApp, o total que ela lê, o botão
 * que registra o aceite. Toda a jornada pública vivia sem uma única prova de
 * interface, enquanto o lado da loja tinha 165.
 */
test.describe("O link público da noiva (E166)", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Noiva do Link ${stamp}`;
  let leadId: string;
  let orcamentoId: string;
  let vendedoraId: string;

  test.beforeAll(async () => {
    const [maria] = await db
      .select({ id: usuariosTable.id })
      .from(usuariosTable)
      .where(eq(usuariosTable.email, estado.mariaEmail));
    vendedoraId = maria.id;
    leadId = randomUUID();
    await db.insert(leadsTable).values({ id: leadId, lojaId: estado.lojaId, noivaNome });
    orcamentoId = randomUUID();
    await db.insert(orcamentosTable).values({
      id: orcamentoId,
      lojaId: estado.lojaId,
      leadId,
      vendedoraId,
      status: "RASCUNHO",
    });
  });

  test.afterAll(async () => {
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("a noiva abre o link, lê a conta que fecha, aceita e vê o comprovante", async ({ page }) => {
    // O preparo é da loja: item com desconto (o O9 mora na linha do desconto)
    // e o link gerado — que congela a versão que ela vai ver.
    await db.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      orcamentoId,
      tipo: "VESTIDO",
      descricao: `Vestido do link ${stamp}`,
      valorUnitario: 5000,
      quantidade: 1,
    });
    await db
      .update(orcamentosTable)
      .set({ descontoTipo: "VALOR", descontoValor: 500, observacoes: "Entrada de R$ 1.500,00." })
      .where(eq(orcamentosTable.id, orcamentoId));

    const link = await page.request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${orcamentoId}/link`,
    );
    expect(link.ok(), await link.text()).toBeTruthy();
    const { token } = (await link.json()) as { token: string };

    // A página dela — sem login: o token é a capability.
    await page.goto(`/orcamento/${token}`);
    await expect(page.getByText(noivaNome)).toBeVisible();
    await expect(page.getByText(`Vestido do link ${stamp}`)).toBeVisible();

    // O9: a conta FECHA na tela — soma, desconto real (bruto − líquido), total.
    await expect(page.getByText("Soma dos itens")).toBeVisible();
    await expect(page.getByText(/R\$\s*5\.000,00/).first()).toBeVisible();
    await expect(page.getByText(/−\s*R\$\s*500,00/)).toBeVisible();
    await expect(page.getByText(/R\$\s*4\.500,00/)).toBeVisible();
    // O7: a observação congelada aparece.
    await expect(page.getByText("Entrada de R$ 1.500,00.")).toBeVisible();

    // O aceite — e o comprovante no lugar do botão.
    await page.getByTestId("aceitar-orcamento").click();
    await expect(page.getByText(/Você aceitou esta proposta em/)).toBeVisible();
    await expect(page.getByTestId("aceitar-orcamento")).toHaveCount(0);

    // Recarregada, a página continua sendo o comprovante.
    await page.reload();
    await expect(page.getByText(/Você aceitou esta proposta em/)).toBeVisible();
  });

  test("a proposta vencida barra o aceite com o caminho — e não com um erro mudo", async ({ page }) => {
    // Uma segunda proposta, enviada e ENVELHECIDA: a validade congelada venceu
    // com a página na mão da noiva (o estado que o C6 mediu).
    const lead2 = randomUUID();
    await db.insert(leadsTable).values({
      id: lead2,
      lojaId: estado.lojaId,
      noivaNome: `E2E Vencida ${stamp}`,
    });
    const orc2 = randomUUID();
    await db.insert(orcamentosTable).values({
      id: orc2,
      lojaId: estado.lojaId,
      leadId: lead2,
      vendedoraId,
      status: "RASCUNHO",
    });
    await db.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      orcamentoId: orc2,
      tipo: "VESTIDO",
      descricao: `Vestido vencido ${stamp}`,
      valorUnitario: 3000,
      quantidade: 1,
    });
    const link = await page.request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${orc2}/link`);
    expect(link.ok(), await link.text()).toBeTruthy();
    const { token } = (await link.json()) as { token: string };
    await db.update(orcamentosTable).set({ validade: new Date("2026-07-10T12:00:00Z") })
      .where(eq(orcamentosTable.id, orc2));
    await db.update(orcamentoVersoesTable).set({ validade: new Date("2026-07-10T12:00:00Z") })
      .where(eq(orcamentoVersoesTable.orcamentoId, orc2));

    try {
      await page.goto(`/orcamento/${token}`);
      await page.getByTestId("aceitar-orcamento").click();

      // A03.3 + C6/D3: o erro aparece ONDE o dedo está, e diz o caminho.
      await expect(page.getByTestId("erro-do-aceite")).toBeVisible();
      await expect(page.getByTestId("erro-do-aceite")).toContainText(/venceu/);
      await expect(page.getByTestId("erro-do-aceite")).toContainText(/vendedora/);
    } finally {
      await db.delete(leadsTable).where(eq(leadsTable.id, lead2));
    }
  });

  test("a proposta recusada diz que foi encerrada — não a proposta inteira sem uma palavra", async ({ page }) => {
    const lead3 = randomUUID();
    await db.insert(leadsTable).values({
      id: lead3,
      lojaId: estado.lojaId,
      noivaNome: `E2E Recusada ${stamp}`,
    });
    const orc3 = randomUUID();
    await db.insert(orcamentosTable).values({
      id: orc3,
      lojaId: estado.lojaId,
      leadId: lead3,
      vendedoraId,
      status: "RASCUNHO",
    });
    await db.insert(orcamentoItensTable).values({
      id: randomUUID(),
      lojaId: estado.lojaId,
      orcamentoId: orc3,
      tipo: "VESTIDO",
      descricao: `Vestido recusado ${stamp}`,
      valorUnitario: 2000,
      quantidade: 1,
    });
    const link = await page.request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${orc3}/link`);
    expect(link.ok(), await link.text()).toBeTruthy();
    const { token } = (await link.json()) as { token: string };
    const recusa = await page.request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${orc3}/recusar`,
    );
    expect(recusa.ok(), await recusa.text()).toBeTruthy();

    try {
      // O8: o ramo que não existia — ela reabria o link e via a proposta
      // inteira que a loja já deu por perdida, com validade prometida no
      // rodapé e sem uma palavra sobre a recusa.
      await page.goto(`/orcamento/${token}`);
      await expect(page.getByTestId("proposta-encerrada")).toBeVisible();
      await expect(page.getByTestId("aceitar-orcamento")).toHaveCount(0);
    } finally {
      await db.delete(leadsTable).where(eq(leadsTable.id, lead3));
    }
  });
});
