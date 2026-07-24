import { expect, type Page, type Locator, type APIRequestContext, request } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface E2EState {
  lojaId: string;
  lojaNome: string;
  adminEmail: string;
  mariaEmail: string;
  senha: string;
  vestidoId: string;
  leadId: string;
  orcamentoId: string;
  contratoId: string | null;
  cabineId: string;
}

export function lerEstado(): E2EState {
  return JSON.parse(readFileSync(path.join(__dirname, ".state.json"), "utf-8"));
}

export const API_URL = "http://localhost:5099";

/** Login pela UI (o mesmo caminho da usuária real). */
export async function loginViaUI(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/**
 * Sessão via API com loja ativa (login + selecionar-loja), injetando o cookie
 * httpOnly no browser. Necessário para a vendedora: a tela de selecionar loja
 * quebra para ela (C5), então a UI não oferece caminho até o dashboard.
 */
export async function sessaoViaAPI(
  page: Page,
  email: string,
  senha: string,
  lojaId: string,
): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: API_URL });
  const login = await api.post("/api/auth/login", { data: { email, senha } });
  expect(login.ok(), `login API de ${email} deveria responder 200`).toBeTruthy();
  const selecionar = await api.post("/api/auth/selecionar-loja", { data: { lojaId } });
  expect(selecionar.ok(), "selecionar-loja via API deveria responder 200").toBeTruthy();

  const cookies = (await api.storageState()).cookies.map((c) => ({
    ...c,
    // O cookie foi emitido para :5099; o browser navega em :5173.
    domain: "localhost",
  }));
  await page.context().addCookies(cookies);
  return api;
}

/**
 * Fecha o tour do acesso (E24), que abre modal sobre o dashboard na PRIMEIRA
 * entrada de cada perfil. Enquanto ele está aberto o overlay do Radix intercepta
 * todo clique atrás dele — a sidebar existe no snapshot mas nada nela responde,
 * e o spec morre por timeout num `click` que parece trivial.
 *
 * Espera antes de checar: o tour monta depois que os acessos do /me resolvem,
 * então um `isVisible()` seco passa direto e a corrida volta mais tarde.
 */
export async function fecharTourDoAcesso(page: Page): Promise<void> {
  const comecar = page.getByRole("button", { name: "Começar" });
  await comecar.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if (await comecar.isVisible().catch(() => false)) {
    await comecar.click();
    await expect(comecar).toBeHidden();
  }
}

/**
 * Arraste de verdade, para as telas com dnd-kit (funil do E27, grade do E28).
 *
 * `dragTo` do Playwright é um salto único e o PointerSensor só ativa depois de
 * 8px de movimento — o salto não passa por esse limiar e o drop nunca acontece.
 * Daí os passos intermediários.
 */
export async function arrastar(page: Page, alca: Locator, alvo: Locator): Promise<void> {
  // Numa grade alta com overflow, o alvo pode estar fora da viewport: o mouse
  // não alcança um ponto que não está na tela. Trazer o alvo à vista primeiro.
  await alvo.scrollIntoViewIfNeeded();
  const origem = await alca.boundingBox();
  const destino = await alvo.boundingBox();
  if (!origem || !destino) throw new Error("origem ou destino sem caixa visível");

  await page.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2);
  await page.mouse.down();
  // O salto com passos intermediários cruza o limiar de 8px do PointerSensor já
  // no primeiro sub-passo; o clamp evita mirar longe demais numa coluna alta,
  // e numa célula baixa cai no centro (height/2 < 120).
  await page.mouse.move(
    destino.x + destino.width / 2,
    destino.y + Math.min(destino.height / 2, 120),
    { steps: 20 },
  );
  await page.mouse.up();
}

export interface ErroApi {
  status: number;
  url: string;
}

/**
 * Coleta respostas de erro das chamadas /api feitas pela página — evidência
 * objetiva de contrato quebrado entre frontend e servidor.
 *
 * 404s que são ESTADO (não erro) ficam de fora: o card do portal (E78)
 * pergunta "existe link?" e "nunca gerado" responde 404 por contrato.
 */
const ERROS_ESPERADOS = [/^GET .*\/leads\/[^/]+\/portal$/];

export function coletarErrosApi(page: Page): ErroApi[] {
  const erros: ErroApi[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/") || res.status() < 400) return;
    const caminho = url.replace(/^https?:\/\/[^/]+/, "");
    const assinatura = `${res.request().method()} ${caminho}`;
    if (res.status() === 404 && ERROS_ESPERADOS.some((re) => re.test(assinatura))) return;
    erros.push({ status: res.status(), url: caminho });
  });
  return erros;
}

export function resumoErros(erros: ErroApi[]): string {
  return erros.map((e) => `${e.status} ${e.url}`).join("\n");
}
