import { test, expect } from "@playwright/test";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, leadsTable, contratosTable, parcelasTable } from "../lib/db/src/index";
import { coletarErrosApi, resumoErros, lerEstado, API_URL, QUALIFICACAO_DA_NOIVA } from "./helpers";
import { getGetContratoUrl } from "@workspace/api-client-react";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Contratos", () => {
  /**
   * E246 (D3 da conferência) — o contrato é PRÓPRIO, criado pela API. Três dos
   * quatro testes deste arquivo eram `test.skip(!estado.contratoId)`: o
   * `global-setup` pega "algum contrato" da loja (`limit(1)` sem `order by`), e
   * num banco novo não há nenhum — os "4 skipped" da medição da S-O93 eram
   * quatro testes AUSENTES (regra 19), e quando rodavam, rodavam contra um
   * contrato arbitrário (hoje um ATIVO, amanhã um dos 496 CANCELADOs). A
   * receita é a do `09`/`35`: noiva qualificada + contrato com uma parcela,
   * apagados no `afterAll`.
   */
  const stamp = Date.now();
  let leadId: string;
  let contratoId: string;

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });
    const lead = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/leads`, {
      data: { noivaNome: `E2E Contratos ${stamp}`, origem: "LOJA", ...QUALIFICACAO_DA_NOIVA },
    });
    expect(lead.status(), await lead.text()).toBe(201);
    leadId = ((await lead.json()) as { id: string }).id;
    const me = await request.get(`${API_URL}/api/auth/me`);
    const vendedoraId = (await me.json()).usuario.id;
    const contrato = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/contratos`, {
      data: {
        leadId,
        vendedoraId,
        valorTotal: 2500,
        parcelas: [{ numero: 1, valorPrevisto: 2500, vencimento: new Date(Date.now() + 30 * 86_400_000).toISOString() }],
      },
    });
    expect(contrato.status(), await contrato.text()).toBe(201);
    contratoId = (await contrato.json()).id;
  });

  test.afterAll(async () => {
    if (contratoId) {
      await db.delete(parcelasTable).where(eq(parcelasTable.contratoId, contratoId));
      await db.delete(contratosTable).where(eq(contratosTable.id, contratoId));
    }
    if (leadId) await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
  });

  test("lista mostra o contrato existente", async ({ page }) => {
    await page.goto("/contratos");
    await page.getByTestId("input-busca-contrato").fill(`E2E Contratos ${stamp}`);
    await expect(page.locator("a", { hasText: `E2E Contratos ${stamp}` }).first()).toBeVisible();
  });

  // Era o C4 (botão "Novo Contrato" sem handler), fechado na rodada 6 — este
  // teste prova o conserto. S-M28: o comentário dizia "FALHA ESPERADA no
  // main" sobre uma suíte verde com retries: 0 — quem lesse gastava o
  // primeiro gesto conferindo um defeito que não existe, ou descartava um
  // vermelho REAL como "a falha documentada".
  test("botão Novo Contrato leva a um fluxo de criação", async ({ page }) => {
    await page.goto("/contratos");
    await page.getByRole("button", { name: "Novo Contrato" }).click();
    const abriuDialog = await page.getByRole("dialog").isVisible().catch(() => false);
    const navegou = !page.url().endsWith("/contratos");
    expect(
      abriuDialog || navegou,
      "Novo Contrato deveria abrir formulário ou navegar — se falhou, o C4 regrediu",
    ).toBe(true);
  });

  // Era o C2 (o detalhe chamava GET /api/contratos/{id} sem loja e levava
  // 404), fechado na rodada 6 — este teste prova o conserto.
  test("detalhe do contrato carrega valor e parcelas", async ({ page }) => {
    const erros = coletarErrosApi(page);
    await page.goto(`/contratos/${contratoId}`);
    await expect(
      page.getByText("Detalhes financeiros"),
      `Detalhe do contrato deveria abrir — se falhou, o C2 (URL divergente) regrediu:\n${resumoErros(erros)}`,
    ).toBeVisible();
  });

  /**
   * A sonda do C2 tinha virado TAUTOLOGIA: as duas URLs comparadas eram a mesma
   * string literal, então o assert media o status de uma requisição contra o
   * dele mesmo e passava sempre — inclusive se as duas dessem 404. Ela provava
   * que o repo sabe escrever a mesma linha duas vezes.
   *
   * A pergunta que ela deveria fazer é: **a URL que o CLIENTE GERADO monta é a
   * que o servidor atende?** Por isso o caminho sai de `getGetContratoUrl` — a
   * mesma função que a tela chama, importada do pacote gerado — em vez de ser
   * recopiado aqui. Mudou o `openapi.yaml` e o codegen, esta linha muda junto; a
   * literal não mudava, e era esse o buraco.
   */
  test("PROBE API: a URL que o cliente gerado monta é a que o servidor atende (C2)", async ({ request }) => {
    const login = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    expect(login.ok()).toBeTruthy();
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const caminhoDoCliente = getGetContratoUrl(estado.lojaId!, contratoId);
    const resposta = await request.get(`${API_URL}${caminhoDoCliente}`);

    expect(
      resposta.status(),
      `O cliente gerado chama ${caminhoDoCliente} e o servidor respondeu ${resposta.status()}. Se for 404, a URL do cliente e a rota do servidor divergiram (C2).`,
    ).toBe(200);
  });
});
