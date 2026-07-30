import { test, expect } from "@playwright/test";
import path from "node:path";
import { coletarErrosApi, resumoErros, lerEstado, API_URL } from "./helpers";
import { getGetContratoUrl } from "@workspace/api-client-react";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.describe("Contratos", () => {
  test("lista mostra o contrato existente", async ({ page }) => {
    test.skip(!estado.contratoId, "sem contrato seedado");
    await page.goto("/contratos");
    await expect(page.getByText(/Contrato #/).first()).toBeVisible();
  });

  // FALHA ESPERADA no main (achado C4): botão "Novo Contrato" sem handler
  // (contratos/index.tsx:17-20).
  test("botão Novo Contrato leva a um fluxo de criação", async ({ page }) => {
    await page.goto("/contratos");
    await page.getByRole("button", { name: "Novo Contrato" }).click();
    const abriuDialog = await page.getByRole("dialog").isVisible().catch(() => false);
    const navegou = !page.url().endsWith("/contratos");
    expect(
      abriuDialog || navegou,
      "Novo Contrato deveria abrir formulário ou navegar (botão sem handler em contratos/index.tsx:17)",
    ).toBe(true);
  });

  // FALHA ESPERADA no main (achado C2): o detalhe chama GET /api/contratos/{id};
  // o servidor só tem /api/lojas/{lojaId}/contratos/{id} → 404 → "não encontrado"
  // para um contrato que existe. Comprovado também por probe direto na API.
  test("detalhe do contrato carrega valor e parcelas", async ({ page }) => {
    test.skip(!estado.contratoId, "sem contrato seedado");
    const erros = coletarErrosApi(page);
    await page.goto(`/contratos/${estado.contratoId}`);
    await expect(
      page.getByText("Detalhes financeiros"),
      `Detalhe do contrato deveria abrir (bug C2 — URL divergente):\n${resumoErros(erros)}`,
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

    test.skip(!estado.contratoId, "sem contrato seedado");
    const caminhoDoCliente = getGetContratoUrl(estado.lojaId!, estado.contratoId!);
    const resposta = await request.get(`${API_URL}${caminhoDoCliente}`);

    expect(
      resposta.status(),
      `O cliente gerado chama ${caminhoDoCliente} e o servidor respondeu ${resposta.status()}. Se for 404, a URL do cliente e a rota do servidor divergiram (C2).`,
    ).toBe(200);
  });
});
