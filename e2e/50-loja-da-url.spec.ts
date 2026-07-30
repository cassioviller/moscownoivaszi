import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { lerEstado, fecharTourDoAcesso } from "./helpers";

const estado = lerEstado();

// A sessão do setup vem com a loja A ativa — é ela que precisa divergir da URL.
test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E93/D1 — a loja da URL e a loja da sessão divergindo.
 *
 * Este é o teste que o backlog pediu como PRIMEIRA ação do épico, porque a
 * decisão de produto ("quem ganha, a URL ou a sessão?") precisava estar escrita
 * antes de virar código. Ele mora no Playwright e não no vitest por um motivo
 * concreto: o defeito era um LOOP DE RENDER — `use-auth.tsx` copiava a loja da
 * sessão para o store e `app-layout.tsx` copiava a da URL para o mesmo store,
 * ambos com `activeLojaId` nas dependências. Com A ≠ B cada `set` reativava o
 * outro até o React abortar com "Maximum update depth exceeded". Isso não é um
 * valor errado que uma asserção pega: é a aba a 100% de CPU e a tela em branco.
 * O que prova o conserto é um navegador de verdade chegando ao outro lado.
 *
 * A resposta: **a URL ganha**, e a divergência vira uma AÇÃO
 * (`selecionarLoja`), não uma corrida entre efeitos. O servidor não deixava
 * alternativa — `requireSessaoComLoja` responde 403 a toda request cujo
 * `:lojaId` difira do `lojaAtivaId` da sessão, então um bookmark para B com a
 * sessão em A só pode funcionar se alguém disser ao servidor "agora é B".
 */

/** Coleta o que o React grita quando aborta: o erro de profundidade de update. */
function vigiarLoopDeRender(page: Page): { erros: string[] } {
  const erros: string[] = [];
  const capturar = (texto: string) => {
    if (/Maximum update depth exceeded|Too many re-renders/i.test(texto)) erros.push(texto);
  };
  page.on("pageerror", (e) => capturar(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") capturar(msg.text());
  });
  return { erros };
}

test.describe("E93/D1 — a loja da URL manda", () => {
  test("o bookmark: sessão na loja A, URL na loja B → abre em B, sem loop", async ({ page }) => {
    const loop = vigiarLoopDeRender(page);

    // O storageState do setup traz a sessão com a loja A ativa. Entrar direto
    // na URL de B é o bookmark salvo no mês passado — o caminho que travava.
    const trocou = page.waitForResponse(
      (res) => res.url().includes("/api/auth/selecionar-loja") && res.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.goto(`/loja/${estado.lojaBId}/dashboard`);

    // A divergência virou uma ação explícita: a aba PEDE a loja da URL.
    const resposta = await trocou;
    expect(resposta.ok(), "a aba deveria reivindicar a loja da URL ao servidor").toBeTruthy();

    await fecharTourDoAcesso(page);

    // Chegou — e chegou em B, não foi devolvida para A.
    await expect(page.getByRole("heading", { name: /Seu dia/ })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/loja/${estado.lojaBId}/dashboard`));

    // E o dashboard de B responde 200: a sessão do servidor foi de fato movida.
    // Sem isso a tela montaria com 403 em toda query — "abriu" sem nada dentro.
    await expect(page.getByText(/Erro|403|Acesso negado/i).first()).toBeHidden();

    expect(loop.erros, `React abortou por loop de render: ${loop.erros[0]}`).toEqual([]);
  });

  test("loja que não é da pessoa → manda escolher, não trava nem dá 403 em toda query", async ({
    page,
  }) => {
    const loop = vigiarLoopDeRender(page);

    // Um id que existe na URL mas não nas lojas da sessão. Renderizar o
    // conteúdo aqui daria 403 em cada request, sem dizer por quê.
    await page.goto("/loja/loja-que-nao-existe/dashboard");

    await expect(page).toHaveURL(/selecionar-loja/, { timeout: 15_000 });
    expect(loop.erros, `React abortou por loop de render: ${loop.erros[0]}`).toEqual([]);
  });

  test("voltar para a loja A depois de B funciona igual — a troca não é de mão única", async ({
    page,
  }) => {
    const loop = vigiarLoopDeRender(page);

    await page.goto(`/loja/${estado.lojaBId}/dashboard`);
    await fecharTourDoAcesso(page);
    await expect(page.getByRole("heading", { name: /Seu dia/ })).toBeVisible({ timeout: 20_000 });

    await page.goto(`/loja/${estado.lojaId}/dashboard`);
    await expect(page.getByRole("heading", { name: /Seu dia/ })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/loja/${estado.lojaId}/dashboard`));

    expect(loop.erros, `React abortou por loop de render: ${loop.erros[0]}`).toEqual([]);
  });
});
