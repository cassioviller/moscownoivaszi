import { test, expect, request as pwRequest, type Page } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E87: a tela de provas pede o RECORTE pela janela do E83 — futuras = `de=hoje`,
 * passadas = `ate=ontem` — e o toggle continua contando a verdade: cada lente
 * mostra exatamente a prova que lhe pertence, e nenhuma request pede o acervo
 * inteiro. Duas noivas de nomes únicos (uma prova futura, uma passada) provam
 * as duas direções do corte.
 */
test.describe("Provas pedem o recorte (E87)", () => {
  const sufixo = Date.now();
  const nomeFutura = `E2E Prova Futura ${sufixo}`;
  const nomePassada = `E2E Prova Passada ${sufixo}`;

  /** Coleta as URLs das chamadas GET /atendimentos que a tela dispara. */
  function observarAtendimentos(page: Page): URL[] {
    const urls: URL[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (r.method() === "GET" && url.pathname.endsWith("/atendimentos")) urls.push(url);
    });
    return urls;
  }

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: API_URL });
    await api.post("/api/auth/login", {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await api.post("/api/auth/selecionar-loja", { data: { lojaId: estado.lojaId } });

    const equipe = await api.get(`/api/lojas/${estado.lojaId}/equipe`);
    const vendedoraId = ((await equipe.json()) as { usuarioId: string }[])[0]!.usuarioId;

    // Instantes únicos por run: a cabine tem UNIQUE (cabineId, inicio) e o
    // banco do e2e persiste entre execuções.
    const jitterMs = Date.now() % 3_600_000;
    const prova = async (noivaNome: string, offsetDias: number) => {
      const lead = await api.post(`/api/lojas/${estado.lojaId}/leads`, {
        data: { noivaNome, origem: "LOJA" },
      });
      expect(lead.status(), await lead.text()).toBe(201);
      const base = new Date(Date.now() + offsetDias * 24 * 3_600_000);
      base.setHours(9, 0, 0, 0);
      const res = await api.post(`/api/lojas/${estado.lojaId}/atendimentos`, {
        data: {
          leadId: ((await lead.json()) as { id: string }).id,
          cabineId: estado.cabineId,
          vendedoraId,
          tipo: "PROVA",
          inicio: new Date(base.getTime() + jitterMs).toISOString(),
        },
      });
      expect(res.status(), await res.text()).toBe(201);
    };

    await prova(nomeFutura, 6);
    await prova(nomePassada, -6);
    await api.dispose();
  });

  test("o toggle futuras/passadas conta a verdade e só pede a janela", async ({ page }) => {
    const chamadas = observarAtendimentos(page);

    await page.goto("/provas");
    await expect(page.getByRole("heading", { name: "Provas", exact: true })).toBeVisible();

    // Lente das próximas: a prova futura está, a passada NÃO veio junto.
    await expect(page.getByText(nomeFutura)).toBeVisible();
    await expect(page.getByText(nomePassada)).toHaveCount(0);

    // Ver o passado é uma escolha explícita — e a lente inverte por inteiro.
    await page.getByRole("button", { name: "Ver provas anteriores" }).click();
    await expect(page.getByRole("heading", { name: "Provas anteriores" })).toBeVisible();
    await expect(page.getByText(nomePassada)).toBeVisible();
    await expect(page.getByText(nomeFutura)).toHaveCount(0);

    // Nenhuma chamada pediu o acervo: toda request de atendimentos que a página
    // dispara (a tela E o poll do sino, que também roda aqui) leva uma borda de
    // janela; e a tela pediu exatamente as duas lentes de PROVA — futuras com
    // de=, passadas com ate=.
    expect(chamadas.length).toBeGreaterThanOrEqual(2);
    for (const url of chamadas) {
      expect(
        url.searchParams.has("de") || url.searchParams.has("ate"),
        `pediu o acervo inteiro: ${url}`,
      ).toBe(true);
    }
    const daTela = chamadas.filter((u) => u.searchParams.get("tipo") === "PROVA");
    expect(daTela.some((u) => u.searchParams.has("de") && !u.searchParams.has("ate"))).toBe(true);
    expect(daTela.some((u) => u.searchParams.has("ate") && !u.searchParams.has("de"))).toBe(true);
  });
});
