import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, contratosTable, parcelasTable, registrosCobrancaTable, leadsTable } from "../lib/db/src/index";
import { lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * Histórico de cobrança — o accordion por noiva na fila de inadimplência.
 *
 * A fila só existe se houver parcela PREVISTA vencida, e o seed global não tem
 * nenhuma (ninguém está em atraso). Este spec cria a sua própria noiva em
 * atraso: contrato + plano com o primeiro vencimento no passado.
 */
test.describe("Cobrança — histórico por noiva", () => {
  /**
   * E246 (D4 da conferência) — UM ramo só. O spec bifurcava por ambiente:
   * "já há atraso na fila? então não crio" — e no dev, que SEMPRE tem atraso,
   * o ramo que cria nunca rodava (foi assim que a S-O145 ficou escondida até
   * o banco virgem da S-O93). Agora cria sempre a própria noiva em atraso e
   * mira a LINHA DELA na fila, não a primeira que aparecer.
   */
  const stamp = Date.now();
  const nomeDaNoiva = `E2E Cobrança histórico ${stamp}`;
  let contratoId: string | null = null;
  let registroCobrancaId: string | null = null;
  let leadId: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    // A rota /equipe expõe `usuarioId`, não `id` — tipar errado fazia o POST
    // abaixo nascer com vendedoraId undefined (CORPO_INVALIDO).
    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];

    /**
     * S-O145 — a noiva do fecho é PRÓPRIA e QUALIFICADA. O spec fechava contrato
     * para `estado.leadId` (a noiva do seed, sem os 12 dados da qualificação),
     * e só passava no dev porque lá SEMPRE há parcela em atraso e este ramo
     * nunca rodava; no banco virgem da medição da S-O93 ele rodou e levou
     * `422 QUALIFICACAO_INCOMPLETA` (E215). O E2E não pode depender do que o
     * dev acumulou — a S-O73 pela quarta vez.
     */
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: nomeDaNoiva, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;

    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId,
        vendedoraId: vendedoras[0]!.usuarioId,
        valorTotal: 3000,
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = ((await contrato.json()) as { id: string }).id;

    // 120 dias atrás: cai na faixa "mais de 60 dias" e não depende de quando a
    // suíte roda.
    const vencido = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const plano = await request.post(
      `${API_URL}/api/lojas/${estado.lojaId}/contratos/${contratoId}/parcelas/gerar-plano`,
      { data: { numParcelas: 1, primeiroVencimento: vencido } },
    );
    expect(plano.status(), await plano.text()).toBe(201);
  });

  test.afterAll(async () => {
    // O banco do e2e persiste entre execuções: sem limpar, cada run soma mais
    // uma noiva "em atraso" ao acervo. Parcelas antes do contrato, e a noiva
    // (própria desde a S-O145) por último — `contratos.lead_id` é RESTRICT.
    if (registroCobrancaId) {
      await db.delete(registrosCobrancaTable).where(eq(registrosCobrancaTable.id, registroCobrancaId));
    }
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("abrir o histórico busca só o da noiva aberta, e o contato registrado aparece", async ({
    page,
    request,
  }) => {
    // Quem a tela vai creditar pelo contato: o usuário da sessão, não um nome
    // fixo no teste.
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    const me = await request.get(`${API_URL}/api/auth/me`);
    const { nome: meuNome } = (await me.json()).usuario as { nome: string };
    expect(meuNome, "o /auth/me deveria dizer quem sou").toBeTruthy();

    const chamadas: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.pathname.includes("/cobrancas")) chamadas.push(`${r.method()} ${url.pathname}`);
    });
    const falhas: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/") && r.status() >= 400) {
        falhas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      }
    });

    await page.goto("/financeiro/cobranca");
    await expect(page.getByRole("heading", { name: "Cobrança", exact: true })).toBeVisible();

    // A linha da NOSSA noiva — não a primeira da fila.
    const linha = page.locator("li", { has: page.getByRole("button", { name: /Histórico/ }) }).filter({ hasText: nomeDaNoiva }).first();
    await expect(linha).toBeVisible();

    // A query é LAZY: antes de abrir, nenhuma request de histórico saiu.
    await page.waitForLoadState("networkidle");
    expect(chamadas, "histórico não deveria ser buscado antes de abrir").toEqual([]);

    await linha.getByRole("button", { name: /Histórico/ }).click();

    // O painel abriu (o formulário é o que sempre existe — o histórico pode já
    // ter registros de uma execução anterior: o banco de dev é persistente).
    await expect(linha.getByRole("button", { name: "Registrar contato" })).toBeVisible();
    expect(chamadas.filter((c) => c.startsWith("GET"))).toHaveLength(1);

    const registros = linha.locator("ul li");
    const antes = await registros.count();

    const recado = `E2E ligou em ${Date.now()}`;
    await linha.getByLabel("O que ficou combinado").fill(recado);
    // O id do registro criado fica guardado para o afterAll apagar — só ele,
    // não o histórico que a fila acumulou de outros lugares.
    const [respostaPost] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/cobrancas"),
      ),
      linha.getByRole("button", { name: "Registrar contato" }).click(),
    ]);
    registroCobrancaId = ((await respostaPost.json()) as { id: string }).id;

    await expect(linha.getByText(recado)).toBeVisible();
    await expect(registros).toHaveCount(antes + 1);
    // Recém-registrado = mais recente: o histórico lê do topo para o passado.
    await expect(registros.first()).toContainText(recado);
    // E diz QUEM falou — o autor vem da sessão de quem está logado.
    await expect(registros.first()).toContainText(meuNome);
    expect(falhas, `Chamadas de API falharam: ${falhas.join(", ")}`).toEqual([]);
  });

  test("nenhum 'Invalid Date' no histórico", async ({ page }) => {
    await page.goto("/financeiro/cobranca");
    const linha = page.locator("li", { has: page.getByRole("button", { name: /Histórico/ }) }).filter({ hasText: nomeDaNoiva }).first();
    await linha.getByRole("button", { name: /Histórico/ }).click();
    await page.waitForLoadState("networkidle");
    const corpo = (await linha.textContent()) ?? "";
    expect(corpo).not.toContain("Invalid Date");
    expect(corpo).not.toContain("NaN");
  });
});
