import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  parcelasTable,
  contratosTable,
  orcamentosTable,
  orcamentoItensTable,
} from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E124 (D1/D2/B4): o que se procura se acha.
 *
 * Antes: /contratos e /orcamentos baixavam a loja inteira SEM busca, com o
 * mais antigo primeiro (no banco de dev, 518 contratos e o de janeiro no
 * topo); o card de orçamento não dizia o valor; e a noiva no balcão querendo
 * adiantar a parcela do mês que vem não existia na tela de Receber — a janela
 * default é o mês corrente e não havia busca por nome.
 *
 * O spec cria a própria noiva com contrato (parcela vencendo em +45 dias,
 * fora da janela), e um orçamento de R$ 8.000,00 — e prova pelas TELAS.
 */
test.describe("E124 — busca no acervo e no balcão", () => {
  const stamp = Date.now();
  const noivaNome = `E2E Acervo ${stamp}`;
  let leadId: string;
  let contratoId: string;
  let orcamentoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome, whatsapp: "11955554444", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = (await lead.json()).id;

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: { leadId, vendedoraId: vendedoras[0]!.usuarioId, valorTotal: 8400 },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = (await contrato.json()).id;

    // +45 dias: mês que vem — FORA da janela default de Receber (o caso B4).
    const mesQueVem = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const plano = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`,
      { data: { numParcelas: 1, primeiroVencimento: mesQueVem } },
    );
    expect(plano.status(), await plano.text()).toBe(201);

    // O orçamento "de R$ 8 mil" que só se achava abrindo um por um (D1).
    const orc = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/orcamentos`, {
      data: { leadId },
    });
    expect(orc.status(), await orc.text()).toBe(201);
    orcamentoId = (await orc.json()).id;
    const item = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/orcamentos/${orcamentoId}/itens`,
      { data: { tipo: "VESTIDO", descricao: "Vestido E124", valorUnitario: 8000, quantidade: 1 } },
    );
    expect(item.status(), await item.text()).toBe(201);
  });

  test.afterAll(async () => {
    // O banco do E2E persiste entre execuções: o rastro deste spec sai.
    if (orcamentoId) {
      await db.delete(orcamentoItensTable).where(eq(orcamentoItensTable.orcamentoId, orcamentoId));
      await db.delete(orcamentosTable).where(eq(orcamentosTable.id, orcamentoId));
    }
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("/contratos: o recém-fechado abre na primeira página, e a busca acha pelo nome", async ({
    page,
  }) => {
    await page.goto(`/loja/${estado.lojaId}/contratos`);
    // Recentes-primeiro (P2): o contrato de agora está na página 1, sem rolar
    // o acervo — antes ele era o ÚLTIMO card da lista ascendente.
    await expect(page.getByText(noivaNome).first()).toBeVisible();

    await page.getByTestId("input-busca-contrato").fill(noivaNome);
    const card = page.locator("a", { hasText: noivaNome });
    await expect(card.first()).toBeVisible();
    // O valor continua no card com a busca ativa.
    await expect(card.first().getByText(/8\.400,00/)).toBeVisible();
  });

  test("/orcamentos: a busca acha a noiva e o card diz o valor (D1)", async ({ page }) => {
    await page.goto(`/loja/${estado.lojaId}/orcamentos`);
    await page.getByTestId("input-busca-orcamento").fill(noivaNome);
    const card = page.locator("a", { hasText: noivaNome });
    await expect(card.first()).toBeVisible();
    // "O orçamento de R$ 8 mil" agora se lê da lista.
    await expect(card.first().getByText(/8\.000,00/)).toBeVisible();
  });

  test("/financeiro/receber: a parcela do mês que vem se acha pelo nome (B4)", async ({
    page,
  }) => {
    await page.goto(`/loja/${estado.lojaId}/financeiro/receber`);
    // Sem busca, a linha NÃO está na tela: a janela default é o mês corrente.
    await expect(page.getByText(noivaNome)).toHaveCount(0);

    await page.getByTestId("input-busca-receber").fill(noivaNome);
    // A busca derruba a janela ("a pessoa na sua frente não tem janela") e a
    // tela diz isso.
    await expect(page.getByText("Buscando por nome:")).toBeVisible();
    await expect(page.getByText(noivaNome).first()).toBeVisible();
    await expect(page.getByText(/8\.400,00/).first()).toBeVisible();
  });
});
