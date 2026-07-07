import { expect, type Page, type APIRequestContext, request } from "@playwright/test";
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

export interface ErroApi {
  status: number;
  url: string;
}

/**
 * Coleta respostas de erro das chamadas /api feitas pela página — evidência
 * objetiva de contrato quebrado entre frontend e servidor.
 */
export function coletarErrosApi(page: Page): ErroApi[] {
  const erros: ErroApi[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/") && res.status() >= 400) {
      erros.push({ status: res.status(), url: url.replace(/^https?:\/\/[^/]+/, "") });
    }
  });
  return erros;
}

export function resumoErros(erros: ErroApi[]): string {
  return erros.map((e) => `${e.status} ${e.url}`).join("\n");
}
